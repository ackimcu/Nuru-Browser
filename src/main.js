const { app, BrowserWindow, globalShortcut, ipcMain, dialog, nativeImage, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const settingsModal = require('./settings-modal'); // Import settings modal
const { spawn } = require('child_process');
const https = require('https');

// Determine if running in production environment
const isProduction = process.env.NODE_ENV === 'production' || app.isPackaged;

// Configure logging
log.transports.file.level = 'debug';
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s} [{level}] {text}';
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'nuru_browser.log');

// Settings configuration
const SETTINGS_PATH = path.join(app.getPath('userData'), 'nuru_browser_settings.json');
const DEFAULT_SETTINGS = {
  frameless: true,
  zoom_factor: 1.5,
  // Whether to restore last page on startup
  restoreLastPage: true,
  geometry: {
    width: 1280,
    height: 800,
    x: undefined,
    y: undefined
  },
  windowState: 'normal',
  search_engine: {
    name: 'google',
    url: 'https://www.google.com/search?q=',
    icon: 'fab fa-google'
  },
  // Default homepage for the Home button
  homepage: 'https://www.google.com/',
  development_mode: false, 
  features: {
    adblock: true
  }
};

let mainWindow;
let diagnosticsWindow;
let settingsWindow = null; // Settings window reference
let settings = DEFAULT_SETTINGS;

// Add ad blocklist loading utilities
const BLOCKLIST_DIR = path.join(__dirname, '..', 'Ad Blocklist');
let adBlocklist = new Set();

function loadBlocklist() {
  const domains = [];
  log.info(`Adblock: loading blocklists from ${BLOCKLIST_DIR}`);
  try {
    if (fs.existsSync(BLOCKLIST_DIR)) {
      const files = fs.readdirSync(BLOCKLIST_DIR).filter(f => f.endsWith('.txt'));
      log.info(`Adblock: found ${files.length} .txt files in blocklist folder`);
      files.forEach(file => {
        const data = fs.readFileSync(path.join(BLOCKLIST_DIR, file), 'utf8');
        data.split(/\r?\n/).forEach(line => {
          const d = line.trim();
          if (d && !d.startsWith('#')) domains.push(d);
        });
      });
    }
  } catch (err) {
    log.error('Error loading ad blocklist:', err);
  }
  const set = new Set(domains);
  log.info(`Adblock: loaded ${set.size} domains from blocklists`);
  return set;
}

// Efficient suffix-based hostname blocker
function isBlockedDomain(host) {
  if (adBlocklist.has(host)) return true;
  let idx = host.indexOf('.');
  while (idx !== -1) {
    const parent = host.substring(idx + 1);
    if (adBlocklist.has(parent)) return true;
    idx = host.indexOf('.', idx + 1);
  }
  return false;
}

// Register global adblock handler
function registerGlobalAdblock() {
  // Intercept on defaultSession and the browsing webview partition
  const sessions = [session.defaultSession, session.fromPartition('persist:browsing')];
  sessions.forEach(sess => {
    sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      try {
        const host = new URL(details.url).hostname;
        if (settings.features.adblock && isBlockedDomain(host)) {
          log.info(`Adblock: blocking request to ${host}`);
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('adblock-blocked', host);
          }
          return callback({ cancel: true });
        }
      } catch (e) {
        log.error('Adblock URL parse error:', e);
      }
      callback({});
    });
  });
  log.info('Adblock: global adblock handlers registered on all sessions');
}

const chromeVersion = '136.0.7103.113';

async function fetchLatestChromeVersion() {
  return new Promise((resolve, reject) => {
    https.get('https://omahaproxy.appspot.com/all?os=linux&channel=stable&format=json', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const arr = JSON.parse(data);
          const entry = arr.find(e => e.os === 'linux' && e.channel === 'stable');
          if (entry && entry.version) resolve(entry.version);
          else reject(new Error('Chrome version not found'));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

app.whenReady().then(async () => {
  try {
    chromeVersion = await fetchLatestChromeVersion();
    log.info(`Fetched latest Chrome version: ${chromeVersion}`);
  } catch (err) {
    log.error('Failed to fetch latest Chrome version:', err);
  }
});

app.on('web-contents-created', (event, contents) => {
  // Override user-agent for both BrowserWindow and webview contents
  if (['webview', 'window'].includes(contents.getType())) {
    try {
      const fullUA = session.defaultSession.getUserAgent();
      // Remove the Electron/<version> token
      let ua = fullUA.replace(/\s?Electron\/[\d\.]+/, '');
      // Override Chrome version to match desired version
      ua = ua.replace(/Chrome\/[\d\.]+/, `Chrome/${chromeVersion}`);
      contents.setUserAgent(ua);
      log.info(`UserAgent overridden to pure Chrome: ${ua}`);
    } catch (err) {
      log.error('Error setting user agent:', err);
    }
    // Context menu for webview
    contents.on('context-menu', (e, params) => {
      const { linkURL, pageURL, selectionText } = params;
      const menuTemplate = [
        { label: '🔗 Open Link in New Tab', click: () => mainWindow.webContents.send('context-menu-new-tab', linkURL || pageURL) },
        { label: '🔄 Reload', click: () => contents.reload() },
        { label: '💾 Save As', click: () => contents.savePage(pageURL, { saveAs: true }) },
        { type: 'separator' },
        { role: 'copy', label: '📋 Copy', enabled: !!selectionText },
        { role: 'paste', label: '📋 Paste' },
        { type: 'separator' },
        { label: '🛠 Open Diagnostics', click: () => createDiagnosticsWindow() },
        { label: '🔖 Open Bookmarks', click: () => mainWindow.webContents.send('toggle-selects-modal') },
        { label: '⚙️ Open Settings', click: () => createSettingsWindow() }
      ];
      const menu = Menu.buildFromTemplate(menuTemplate);
      menu.popup({ window: mainWindow });
    });
  }
});

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = fs.readFileSync(SETTINGS_PATH, 'utf8');
      const loadedSettings = JSON.parse(data);
      settings = { ...DEFAULT_SETTINGS, ...loadedSettings };
      // Ensure features settings are deep-merged to preserve default adblock flag
      settings.features = { ...DEFAULT_SETTINGS.features, ...settings.features };
      log.info('Settings loaded successfully');
    } else {
      log.info('No settings file found, using defaults');
      saveSettings();
    }
  } catch (error) {
    log.error('Failed to load settings:', error);
    settings = { ...DEFAULT_SETTINGS };
    saveSettings();
  }
}

function saveSettings() {
  try {
    log.info('Saving settings to:', SETTINGS_PATH);
    
    // Ensure the settings directory exists
    const settingsDir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    log.info('Settings saved successfully');
    
    // Notify renderer process if available
    if (mainWindow) {
      mainWindow.webContents.send('settings-updated', settings);
    }
  } catch (error) {
    log.error('Failed to save settings:', error);
  }
}

async function createMainWindow() {
  const { width, height, x, y } = settings.geometry;
  
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: x,
    y: y,
    backgroundColor: '#272727',
    frame: !settings.frameless,
    transparent: true,
    titleBarStyle: 'hidden',
    roundedCorners: true,
    vibrancy: 'ultra-dark',
    visualEffectState: 'active',
    icon: nativeImage.createFromPath(path.join(__dirname, '..', 'logo', 'Nuru.png')).resize({ width: 48, height: 48 }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true, 
      allowRunningInsecureContent: false, 
      plugins: true,
      experimentalFeatures: false,
      webviewTag: true, 
    }
  });

  // Apply window state
  if (settings.windowState === 'maximized') {
    mainWindow.maximize();
  }

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Hardware acceleration check
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('check-webgl');
    // Check for updates after the main window loads
    if (process.env.NODE_ENV !== 'development') {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });

  // Save window state on close
  mainWindow.on('close', () => {
    const isMaximized = mainWindow.isMaximized();
    settings.windowState = isMaximized ? 'maximized' : 'normal';
    
    if (!isMaximized) {
      const bounds = mainWindow.getBounds();
      settings.geometry = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y
      };
    }
    
    saveSettings();
  });

  // Apply zoom factor
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(settings.zoom_factor);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Fullscreen change notifications
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', false);
  });

  // Ad block: intercept requests for ad domains
  const { session } = mainWindow.webContents;
  session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    if (settings.features && settings.features.adblock) {
      try {
        const host = new URL(details.url).hostname;
        if (isBlockedDomain(host)) {
          return callback({ cancel: true });
        }
      } catch (e) {
        // ignore parse errors
      }
    }
    callback({});
  });
}

function createDiagnosticsWindow() {
  // If diagnostics window already exists, focus it and return
  if (diagnosticsWindow) {
    diagnosticsWindow.focus();
    return;
  }

  // Create ultra simple diagnostics window
  log.info('Creating ultra-simple diagnostics window');
  
  try {
    // Use the ultra-simple preload script
    const preloadPath = path.join(__dirname, 'simple-preload.js');
    const preloadExists = fs.existsSync(preloadPath);
    log.info(`Ultra-simple preload script path: ${preloadPath}, exists: ${preloadExists}`);
    
    if (!preloadExists) {
      throw new Error('Ultra-simple preload script not found');
    }
    
    diagnosticsWindow = new BrowserWindow({
      width: 900,
      height: 800,
      minWidth: 600,
      minHeight: 500,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      titleBarStyle: 'hidden',
      roundedCorners: true,
      title: 'Nuru Browser - Diagnostics',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath,
        sandbox: false, 
        spellcheck: false,
        devTools: true
      }
    });

    // Always open DevTools for diagnostics to help debugging
    diagnosticsWindow.webContents.openDevTools();
    log.info('DevTools opened for diagnostics window');
    
    // Load the ultra-simple diagnostics HTML file
    const htmlPath = path.join(__dirname, 'renderer', 'ultra-simple.html');
    log.info(`Loading ultra-simple diagnostics HTML from: ${htmlPath}`);
    
    if (!fs.existsSync(htmlPath)) {
      throw new Error('Ultra-simple diagnostics HTML file not found');
    }
    
    diagnosticsWindow.loadFile(htmlPath);
    
    // Log when window is ready
    diagnosticsWindow.webContents.on('did-finish-load', () => {
      log.info('Ultra-simple diagnostics window loaded successfully');
    });

    // Handle load errors
    diagnosticsWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      log.error(`Failed to load diagnostics window: ${errorDescription} (${errorCode})`);
      dialog.showErrorBox('Diagnostics Error', `Failed to load: ${errorDescription}`);
    });
    
    // Cleanup when window is closed
    diagnosticsWindow.on('closed', () => {
      log.info('Diagnostics window closed');
      diagnosticsWindow = null;
    });
  } catch (error) {
    log.error(`Error creating ultra-simple diagnostics window: ${error.message}`);
    dialog.showErrorBox('Diagnostics Error', `Could not open diagnostics window: ${error.message}`);
  }
}

// IPC handlers for ultra-simple diagnostics
ipcMain.handle('get-system-info', () => {
  log.info('System info requested for ultra-simple diagnostics');
  try {
    // Check if auto-updates are available
    const isAppImage = process.env.APPIMAGE ? true : false;
    let updateStatus = 'Unknown';
    
    if (settings.development_mode) {
      updateStatus = 'Disabled (Dev Mode)';
    } else if (isAppImage) {
      updateStatus = 'Enabled (AppImage)';
    } else {
      updateStatus = 'Enabled';
    }
    
    return {
      appName: 'Nuru Browser',
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      updateStatus: updateStatus,
      isAppImage: isAppImage
    };
  } catch (error) {
    log.error('Error getting system info:', error);
    return {
      appName: 'Nuru Browser',
      appVersion: '1.0.0',
      error: error.message
    };
  }
});

ipcMain.handle('download-update', async () => {
  log.info('Update download requested by user');
  try {
    if (settings.development_mode) {
      return { success: false, error: 'Cannot download updates in development mode' };
    }
    
    // Return early if updater is not configured
    if (!autoUpdater.getFeedURL()) {
      log.warn('Auto-updater feed URL not configured');
      return { success: false, error: 'Update feed not configured' };
    }
    
    // Set up listeners for the download process
    const downloadPromise = new Promise((resolve) => {
      let downloadProgress = 0;
      
      // Progress listener
      const onProgress = (progressObj) => {
        downloadProgress = progressObj.percent || 0;
        log.info(`Download progress: ${downloadProgress.toFixed(2)}%`);
        if (mainWindow) {
          mainWindow.webContents.send('update-download-progress', { percent: downloadProgress });
        }
      };
      
      // Download completed listener
      const onDownloaded = () => {
        log.info('Update downloaded successfully');
        autoUpdater.removeListener('download-progress', onProgress);
        autoUpdater.removeListener('update-downloaded', onDownloaded);
        autoUpdater.removeListener('error', onError);
        if (mainWindow) {
          mainWindow.webContents.send('update-downloaded');
        }
        resolve({ success: true, message: 'Update downloaded successfully' });
      };
      
      // Error listener
      const onError = (error) => {
        log.error('Error downloading update:', error);
        autoUpdater.removeListener('download-progress', onProgress);
        autoUpdater.removeListener('update-downloaded', onDownloaded);
        autoUpdater.removeListener('error', onError);
        resolve({ success: false, error: error.message || 'Error downloading update' });
      };
      
      // Set up listeners
      autoUpdater.on('download-progress', onProgress);
      autoUpdater.once('update-downloaded', onDownloaded);
      autoUpdater.once('error', onError);
      
      // Start download
      log.info('Starting update download');
      autoUpdater.downloadUpdate().catch(onError);
    });
    
    return await downloadPromise;
  } catch (error) {
    log.error('Error initiating update download:', error);
    return { success: false, error: error.message || 'Unknown error downloading update' };
  }
});

ipcMain.handle('install-update', () => {
  log.info('Installing update and restarting');
  try {
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (error) {
    log.error('Error installing update:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-for-updates-simple', async () => {
  log.info('Simple update check requested');
  try {
    // Check if in development mode
    if (settings.development_mode) {
      log.info('Updates disabled in development mode');
      return {
        success: true,
        updateAvailable: false,
        message: 'Updates are disabled in development mode'
      };
    }
    
    // Update the last check time
    settings.lastUpdateCheck = Date.now();
    saveSettings();
    
    // Check if the app is packaged as an AppImage (supports auto-update)
    const isAppImage = process.env.APPIMAGE ? true : false;
    if (!isAppImage && app.isPackaged) {
      log.info('App not running as AppImage, auto-updates may not work properly');
    }
    
    // Create event listener for update events
    let hasUpdate = false;
    let updateInfo = null;
    
    // Return early if updater is not configured
    if (!autoUpdater.getFeedURL()) {
      log.warn('Auto-updater feed URL not configured');
      return {
        success: true,
        updateAvailable: false,
        message: 'Update feed not configured'
      };
    }
    
    // Ensure autoDownload is off so we just check
    autoUpdater.autoDownload = false;
    
    // Check for updates
    const promise = new Promise((resolve) => {
      // Handle update-available
      const onUpdateAvailable = (info) => {
        log.info(`Update available: ${info.version}`);
        hasUpdate = true;
        updateInfo = info;
        autoUpdater.removeListener('update-available', onUpdateAvailable);
        autoUpdater.removeListener('update-not-available', onUpdateNotAvailable);
        autoUpdater.removeListener('error', onError);
        resolve({
          success: true,
          updateAvailable: true,
          currentVersion: app.getVersion(),
          newVersion: info.version,
          releaseNotes: info.releaseNotes || '',
          message: `Update available: ${app.getVersion()} → ${info.version}`
        });
      };

      // Handle update-not-available
      const onUpdateNotAvailable = () => {
        log.info('No updates available');
        autoUpdater.removeListener('update-available', onUpdateAvailable);
        autoUpdater.removeListener('update-not-available', onUpdateNotAvailable);
        autoUpdater.removeListener('error', onError);
        resolve({
          success: true,
          updateAvailable: false,
          message: 'No updates available'
        });
      };

      // Handle error
      const onError = (error) => {
        log.error('Error checking for updates:', error);
        autoUpdater.removeListener('update-available', onUpdateAvailable);
        autoUpdater.removeListener('update-not-available', onUpdateNotAvailable);
        autoUpdater.removeListener('error', onError);
        resolve({
          success: false,
          error: error.message || 'Error checking for updates'
        });
      };

      // Set up event listeners
      autoUpdater.once('update-available', onUpdateAvailable);
      autoUpdater.once('update-not-available', onUpdateNotAvailable);
      autoUpdater.once('error', onError);

      // Add timeout to prevent hanging
      setTimeout(() => {
        if (!hasUpdate) {
          log.warn('Update check timed out after 10 seconds');
          autoUpdater.removeListener('update-available', onUpdateAvailable);
          autoUpdater.removeListener('update-not-available', onUpdateNotAvailable);
          autoUpdater.removeListener('error', onError);
          resolve({
            success: true,
            updateAvailable: false,
            message: 'Update check timed out, status unknown'
          });
        }
      }, 10000);

      // Check for updates
      log.info('Checking for updates...');
      autoUpdater.checkForUpdates().catch(onError);
    });

    return await promise;
  } catch (error) {
    log.error('Error in update check handler:', error);
    return {
      success: false,
      error: error.message || 'Unknown error checking for updates'
    };
  }
});

ipcMain.handle('get-log-content', async () => {
  log.info('Log content requested for diagnostics');
  try {
    const logPath = path.join(app.getPath('userData'), 'nuru_browser.log');
    if (fs.existsSync(logPath)) {
      const data = fs.readFileSync(logPath, 'utf8');
      const lines = data.split('\n');
      return lines.slice(Math.max(0, lines.length - 200)).join('\n');
    }
    return 'No logs found or log file is empty';
  } catch (error) {
    log.error('Error reading log file:', error);
    return `Error reading log file: ${error.message}`;
  }
});

// Simple sync IPC handler for getting userData path (needed for logs)
ipcMain.on('get-user-data-path', (event) => {
  log.info('User data path requested');
  event.returnValue = app.getPath('userData');
});

// IPC handlers
ipcMain.handle('get-settings', () => {
  try {
    return { ...settings };
  } catch (error) {
    log.error('Error getting settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
});

// Handle intercepted links (middle-click, etc.)
ipcMain.on('link-clicked', (event, url) => {
  if (mainWindow) {
    mainWindow.webContents.send('link-clicked', url);
    log.info(`Link clicked and sent to renderer: ${url}`);
  }
});

// Block any attempt to create new windows
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    // Always prevent new window creation
    event.preventDefault();
    
    // Instead, send the URL to the main window to open as a tab
    if (mainWindow) {
      mainWindow.webContents.send('link-clicked', navigationUrl);
      log.info(`Blocked external new window attempt and redirected to tab: ${navigationUrl}`);
    }
  });
  
  // Set a global window open handler for all web contents
  contents.setWindowOpenHandler(({ url }) => {
    // Send the URL to the main window to open as a tab
    if (mainWindow) {
      mainWindow.webContents.send('link-clicked', url);
      log.info(`Intercepted window.open() and redirected to tab: ${url}`);
    }
    // Always deny opening in a new window
    return { action: 'deny' };
  });
});

ipcMain.handle('update-settings', (event, newSettings) => {
  settings = { ...settings, ...newSettings };
  saveSettings();
  return settings;
});

ipcMain.handle('update-zoom', (event, zoomFactor) => {
  if (zoomFactor >= 0.25 && zoomFactor <= 5.0) {
    settings.zoom_factor = zoomFactor;
    saveSettings();
    return zoomFactor;
  }
  return settings.zoom_factor;
});

// Add IPC handler for saving all settings at once
ipcMain.handle('save-all-settings', (event, newSettings) => {
  try {
    log.info('Saving all settings');
    
    // Update restore last page setting if provided
    if (newSettings.restoreLastPage !== undefined) {
      settings.restoreLastPage = newSettings.restoreLastPage;
    }

    // Update search engine setting if provided
    if (newSettings.search_engine) {
      settings.search_engine = newSettings.search_engine;
    }

    // Update homepage setting if provided
    if (newSettings.homepage !== undefined) {
      settings.homepage = newSettings.homepage;
    }

    // Update settings object with new values
    if (newSettings.browser) {
      // Update browser settings
      Object.assign(settings, newSettings.browser);
      
      // Apply zoom immediately if changed
      if (newSettings.browser.zoom_factor && mainWindow) {
        mainWindow.webContents.setZoomFactor(newSettings.browser.zoom_factor);
      }
    }
    
    // Save all settings to disk
    saveSettings();
    
    return { success: true };
  } catch (err) {
    log.error('Error saving all settings:', err);
    return { success: false, error: err.message };
  }
});

// DNS prediction and search engine handling
ipcMain.handle('get-dns-predictions', async (event, url) => {
  try {
    // Simple implementation that just generates predictions
    // In a real implementation, this would use DNS lookup or browser history
    const suggestions = [];
    
    // If it looks like a URL (has dots or no spaces)
    if (url.includes('.') || !url.includes(' ')) {
      // Add some common completions
      const domains = ['.com', '.org', '.net', '.io', '.dev'];
      // If no dot yet, suggest completions
      if (!url.includes('.') && url.length > 1) {
        domains.forEach(domain => {
          suggestions.push({
            type: 'url',
            text: `${url}${domain}`,
            url: `https://${url}${domain}`,
            icon: 'globe'
          });
        });
      }
      
      // Suggest https:// version if they didn't type protocol
      if (!url.startsWith('http') && url.includes('.')) {
        suggestions.push({
          type: 'url',
          text: url,
          url: `https://${url}`,
          icon: 'globe'
        });
      }
    }
    
    // Always add search suggestion
    if (url.trim() !== '') {
      suggestions.push({
        type: 'search',
        text: url,
        engine: settings.search_engine.name,
        icon: 'search'
      });
    }
    
    return suggestions;
  } catch (error) {
    log.error('Error getting DNS predictions:', error);
    return [];
  }
});

ipcMain.handle('save-search-engine', (event, engine) => {
  settings.search_engine = engine;
  saveSettings();
  return settings.search_engine;
});

ipcMain.handle('get-search-engine', () => {
  return settings.search_engine;
});

// Keep original handler for backward compatibility
ipcMain.handle('get-app-info', () => {
  try {
    log.info('App info requested (legacy)');
    const info = {
      appName: 'Nuru Browser',
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      updateStatus: settings.development_mode ? 'Disabled (Dev Mode)' : 'Enabled',
      developmentMode: settings.development_mode
    };
    log.info('App info: ' + JSON.stringify(info));
    return info;
  } catch (error) {
    log.error('Error getting app info (legacy): ' + error.message);
    // Return a minimal object with error information to prevent renderer from crashing
    return {
      appName: 'Nuru Browser',
      appVersion: app.getVersion() || '1.0.0',
      electronVersion: 'Error: ' + (error.message || 'Unknown error'),
      chromeVersion: 'Error loading',
      nodeVersion: 'Error loading',
      platform: 'Error loading',
      arch: 'Error loading',
      updateStatus: 'Error loading',
      error: error.message
    };
  }
});

// Enhanced app info handler with more comprehensive information
ipcMain.handle('get-app-info-v2', () => {
  try {
    log.info('Enhanced app info requested');
    
    // Get update status
    let updateStatus = 'Unknown';
    if (settings.development_mode) {
      updateStatus = 'Disabled (Development Mode)';
    } else if (process.env.APPIMAGE) {
      updateStatus = 'Enabled (AppImage)';
    } else {
      updateStatus = 'Enabled';
    }
    
    // Gather comprehensive app information
    const info = {
      appName: 'Nuru Browser',
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      osVersion: process.getSystemVersion ? process.getSystemVersion() : 'Unknown',
      updateStatus: updateStatus,
      developmentMode: settings.development_mode,
      userDataPath: app.getPath('userData'),
      isPackaged: app.isPackaged,
      locale: app.getLocale(),
      frameless: settings.frameless,
      zoomFactor: settings.zoom_factor,
      timestamp: new Date().toISOString()
    };
    
    log.info('Enhanced app info prepared');
    return info;
  } catch (error) {
    log.error('Error getting enhanced app info: ' + error.message);
    // Throw error for better handling in preload script
    throw error;
  }
});

// New handlers for the enhanced diagnostics system
ipcMain.handle('get-log-path-v2', () => {
  try {
    const logPath = path.join(app.getPath('userData'), 'nuru_browser.log');
    log.info('Log path requested: ' + logPath);
    return logPath;
  } catch (error) {
    log.error('Error getting log path: ' + error.message);
    throw error;
  }
});

ipcMain.handle('check-for-updates-v2', async () => {
  try {
    log.info('Update check requested');
    
    // Check if auto-updates are disabled
    if (settings.development_mode) {
      log.info('Updates disabled in development mode');
      return { 
        success: false, 
        message: 'Updates are disabled in development mode',
        updateAvailable: false
      };
    }
    
    // Check if running as AppImage (which supports auto-updates)
    if (!process.env.APPIMAGE) {
      log.info('Not running as AppImage, updates may not work');
    }
    
    // Perform the update check
    log.info('Checking for updates...');
    autoUpdater.checkForUpdates();
    
    return { 
      success: true, 
      message: 'Update check initiated',
      isAppImage: !!process.env.APPIMAGE
    };
  } catch (error) {
    log.error('Error checking for updates: ' + error.message);
    return { 
      success: false, 
      error: error.message,
      stack: error.stack
    };
  }
});

ipcMain.handle('get-log-path', () => {
  return path.join(app.getPath('userData'), 'nuru_browser.log');
});

ipcMain.handle('toggle-frameless', () => {
  settings.frameless = !settings.frameless;
  saveSettings();
  
  // Notify to restart
  if (mainWindow) {
    mainWindow.webContents.send('settings-updated', 'frameless');
  }
  
  return settings.frameless;
});

ipcMain.on('webgl-status', (event, status) => {
  log.info(`WebGL status: ${status ? 'Available' : 'Unavailable'}`);
  
  if (!status) {
    // Show warning about hardware acceleration
    if (mainWindow) {
      mainWindow.webContents.send('show-error', {
        title: 'Hardware Acceleration Warning',
        message: 'WebGL is not available. This may affect performance and video playback.',
        type: 'warning'
      });
    }
  }
});

ipcMain.on('show-diagnostics', () => {
  createDiagnosticsWindow();
});

ipcMain.on('close-app', () => {
  if (mainWindow) {
    mainWindow.close();
  }
  
  // If there are any other windows open, close them too
  if (diagnosticsWindow) {
    diagnosticsWindow.close();
  }
  
  // Make sure to save settings before quitting
  saveSettings();
});

ipcMain.on('log-message', (event, { level, message }) => {
  if (level === 'error') {
    log.error(message);
  } else if (level === 'warn') {
    log.warn(message);
  } else if (level === 'info') {
    log.info(message);
  } else {
    log.debug(message);
  }
});

// IPC handlers for cache and user data deletion
ipcMain.handle('clear-cache', async () => {
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-all-user-data', async () => {
  const userData = app.getPath('userData');
  const configDir = path.join(os.homedir(), '.config');
  try {
    await fs.promises.rm(userData, { recursive: true, force: true });
    await fs.promises.rm(configDir, { recursive: true, force: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('restart-app', async () => {
  app.relaunch();
  app.exit(0);
});

// Set up global exception handler
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  
  if (mainWindow) {
    mainWindow.webContents.send('show-error', {
      title: 'Application Error',
      message: `An unexpected error occurred: ${error.message}`,
      type: 'error'
    });
  }
  
  // Open diagnostics window for serious errors
  createDiagnosticsWindow();
});

// Auto-updater events
function setupAutoUpdater() {
  // Configure logging for auto-updater
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';
  
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'checking');
    }
  });
  
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'available', info);
    }
  });
  
  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available');
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'not-available');
    }
  });
  
  autoUpdater.on('error', (err) => {
    log.error('Update error:', err);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'error', err.toString());
    }
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    const progressPercent = Math.round(progressObj.percent);
    if (progressPercent % 10 === 0) { // Log every 10%
      log.info(`Download progress: ${progressPercent}%`);
    }
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'progress', progressObj);
    }
  });
  
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded. Will install on quit.');
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'downloaded', info);
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'A new version has been downloaded. Restart the application to apply the updates.',
        buttons: ['Restart', 'Later']
      }).then((returnValue) => {
        if (returnValue.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    }
  });
}

async function updateElectronFramework() {
  return new Promise((resolve) => {
    const updateWin = new BrowserWindow({
      width: 1200, height: 800, frame: false, transparent: true, resizable: false,
      backgroundColor: '#00000000',
      alwaysOnTop: true, modal: true, show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    updateWin.loadFile(path.join(__dirname, 'renderer', 'update-modal.html'));
    updateWin.once('ready-to-show', () => {
      updateWin.show();
      updateWin.webContents.send('update-status', 'Checking latest Electron version...');
    });
    const root = path.join(__dirname, '..');
    let latest = '';
    const ver = spawn('npm', ['view', 'electron', 'version'], { cwd: root, shell: true, stdio: ['ignore','pipe','pipe'] });
    ver.stdout.on('data', data => {
      latest += data.toString();
      console.log(`npm view electron version: ${data.toString().trim()}`);
    });
    ver.stderr.on('data', data => console.error(`npm view error: ${data.toString()}`));
    ver.on('close', () => {
      latest = latest.trim();
      // Only install if there's a newer version
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
      const current = pkg.devDependencies.electron.replace(/[^0-9.]/g, '');
      if (latest === current) {
        updateWin.webContents.send('update-status', `Electron already up-to-date (${current})`);
        setTimeout(() => { updateWin.close(); resolve(); }, 800);
        return;
      }
      updateWin.webContents.send('update-status', `Installing Electron ${latest}...`);
      const inst = spawn('npm', ['install', '--save-dev', `electron@${latest}`], { cwd: root, shell: true, stdio: 'inherit' });
      inst.on('close', () => {
        updateWin.webContents.send('update-done');
        setTimeout(() => { updateWin.close(); resolve(); }, 800);
      });
    });
  });
}

app.whenReady().then(async () => {
  // Run framework updater before window creation
  await updateElectronFramework();
  // Load ad blocklist from files
  adBlocklist = loadBlocklist();
  log.info('Adblock: registering global adblock handler');
  registerGlobalAdblock();
  // Now load settings and create windows
  loadSettings();
  await createMainWindow();
  
  // Setup auto-updater if not in development
  if (app.isPackaged) {
    setupAutoUpdater();
  }
  
  // Register keyboard shortcuts
  globalShortcut.register('CommandOrControl+D', () => {
    createDiagnosticsWindow();
  });
  
  // Register Ctrl+S for Settings
  globalShortcut.register('CommandOrControl+S', () => {
    createSettingsWindow();
  });
  
  // Add IPC handler for showing settings modal
  ipcMain.on('show-settings', () => {
    log.info('Showing settings modal');
    createSettingsWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// IPC handler for manual update check
ipcMain.on('check-for-updates', () => {
  if (!settings.development_mode) {
    autoUpdater.checkForUpdatesAndNotify();
  } else {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', 'disabled-dev');
    }
  }
});

// Development-only features - conditionally included
if (!isProduction) {
  // IPC handler for toggling development mode - only in development builds
  ipcMain.handle('toggle-development-mode', () => {
    settings.development_mode = !settings.development_mode;
    saveSettings();
    
    if (mainWindow) {
      mainWindow.webContents.send('development-mode-changed', settings.development_mode);
    }
    
    log.info(`Development mode ${settings.development_mode ? 'enabled' : 'disabled'}`);
    return settings.development_mode;
  });
  
  log.info('Development features enabled');
} else {
  log.info('Development features disabled (production build)');
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Unregister shortcuts
  globalShortcut.unregisterAll();
});

// Create and show Settings window
function createSettingsWindow() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 900, height: 800, resizable: false, frame: false, titleBarStyle: 'hidden', roundedCorners: true, transparent: true, backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-settings.js')
    }
  });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  // Send current settings to settings window once it's ready
  settingsWindow.webContents.on('did-finish-load', () => {
    settingsWindow.webContents.send('settings-data', settings);
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// IPC: open settings via renderer or menu
ipcMain.on('show-settings', () => createSettingsWindow());

// Handle saving all settings from settings window
ipcMain.handle('save-all-settings', (event, newSettings) => {
  settings = { ...settings, ...newSettings };
  saveSettings();
  return settings;
});
