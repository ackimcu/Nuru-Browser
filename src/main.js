// Import Electron modules
const { app, BrowserWindow, globalShortcut, ipcMain, dialog, nativeImage, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
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
  homepage: 'nuru://start',
  theme: 'dark',
  development_mode: false,
  // Whether to remember window state (position, size)
  rememberWindowState: true,
  // Whether viewports are hidden by default
  viewportsHiddenByDefault: false,
  // Whether autofill is enabled
  autofillEnabled: true,
  features: {
    adblock: true
  },
  cards: {
    weatherLocation: '',
    downloadHistoryCardVisible: false,
    weatherTemperatureUnit: 'celsius' // 'celsius' or 'fahrenheit'
  },
  // Welcome page completion status
  welcomeCompleted: false,
  firstRun: true
};

let mainWindow;
let diagnosticsWindow;
let welcomeWindow;
let settings = DEFAULT_SETTINGS;
let downloadHistory = [];
let downloadHistoryCardVisible = false;

// Path for persisting download history
const DOWNLOAD_HISTORY_PATH = path.join(app.getPath('userData'), 'nuru_browser_download_history.json');

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
        { label: 'Open Link in New Tab', click: () => mainWindow.webContents.send('context-menu-new-tab', linkURL || pageURL) },
        { label: 'Reload', click: () => contents.reload() },
        { label: 'Save As', click: () => contents.savePage(pageURL, { saveAs: true }) },
        { type: 'separator' },
        { role: 'copy', label: 'Copy', enabled: !!selectionText },
        { role: 'paste', label: 'Paste' }
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
    transparent: settings.frameless, // Only transparent when frameless
    titleBarStyle: settings.frameless ? 'hidden' : 'default',
    roundedCorners: settings.frameless, // Only rounded corners when frameless
    vibrancy: settings.frameless ? 'ultra-dark' : undefined, // Only vibrancy when frameless
    visualEffectState: settings.frameless ? 'active' : undefined, // Only visual effects when frameless
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

  // Handle geolocation permissions
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    log.info(`Permission requested: ${permission}`);
    
    if (permission === 'geolocation') {
      // Show a dialog to ask for geolocation permission
      dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Allow', 'Deny'],
        defaultId: 0,
        title: 'Location Access Request',
        message: 'Nuru Browser would like to access your location',
        detail: 'This will be used to automatically detect your location for weather information. You can still manually enter your location if you prefer.',
        noLink: true
      }).then((result) => {
        const allowed = result.response === 0; // 0 = Allow, 1 = Deny
        log.info(`Geolocation permission ${allowed ? 'granted' : 'denied'}`);
        callback(allowed);
      }).catch((error) => {
        log.error('Error showing permission dialog:', error);
        callback(false); // Deny by default if dialog fails
      });
    } else {
      // For other permissions, deny by default
      callback(false);
    }
  });

  // Configure geolocation to avoid Google services issues
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'geolocation') {
      return true; // Allow geolocation permission checks
    }
    return false; // Deny other permissions
  });

  // Disable Google location services to prevent 403 errors
  mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.includes('googleapis.com') && details.url.includes('location')) {
      log.info('Blocking Google location services request to prevent 403 errors');
      callback({ cancel: true });
      return;
    }
    callback({});
  });

  // Allow IP-based geolocation services
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.includes('ipapi.co') || 
        details.url.includes('ipinfo.io') || 
        details.url.includes('ipgeolocation.io') ||
        details.url.includes('ip-api.com') ||
        details.url.includes('freegeoip.app') ||
        details.url.includes('ipwho.is')) {
      log.info('Allowing IP geolocation service:', details.url);
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*'],
          'Access-Control-Allow-Methods': ['GET'],
          'Access-Control-Allow-Headers': ['Content-Type']
        }
      });
      return;
    }
    callback({});
  });

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

  // Store active downloads
  const activeDownloads = new Map();

  // Register download handler for webview downloads
  const downloadSession = require('electron').session.fromPartition('persist:browsing');
  downloadSession.on('will-download', (event, item) => {
    // Track download in history
    trackDownload(item.getURL());
    const filename = item.getFilename();
    const totalBytes = item.getTotalBytes();
    const downloadId = Date.now().toString();
    
    // Store the download item
    activeDownloads.set(downloadId, item);
    
    // Notify renderer that a download has started
    mainWindow.webContents.send('download-start', { 
      id: downloadId, 
      filename, 
      totalBytes,
      percent: 0,
      receivedBytes: 0,
      state: 'downloading'
    });
    
    // Listen for download progress
    item.on('updated', () => {
      const receivedBytes = item.getReceivedBytes();
      const percent = totalBytes > 0 ? Math.round(receivedBytes / totalBytes * 100) : 0;
      mainWindow.webContents.send('download-progress', { 
        id: downloadId, 
        filename,
        receivedBytes, 
        totalBytes, 
        percent,
        state: 'downloading'
      });
    });
    
    // When download is finished or interrupted
    item.once('done', (e, state) => {
      activeDownloads.delete(downloadId);
      mainWindow.webContents.send('download-done', { 
        id: downloadId, 
        filename, 
        state: state === 'completed' ? 'completed' : 'interrupted',
        receivedBytes: item.getReceivedBytes(),
        totalBytes,
        percent: state === 'completed' ? 100 : Math.round((item.getReceivedBytes() / totalBytes) * 100) || 0
      });
    });
  });
  
  // Handle cancel download request
  ipcMain.handle('cancel-download', (event, downloadId) => {
    const downloadItem = activeDownloads.get(downloadId);
    if (downloadItem) {
      downloadItem.cancel();
      activeDownloads.delete(downloadId);
      return { success: true };
    }
    return { success: false, error: 'Download not found' };
  });
}

function createWelcomeWindow() {
  // If welcome window already exists, focus it and return
  if (welcomeWindow) {
    welcomeWindow.focus();
    return;
  }

  log.info('Creating welcome window');
  
  try {
    // Get screen dimensions to center the window
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    // Calculate window dimensions (80% of screen size)
    const windowWidth = Math.floor(screenWidth * 0.8);
    const windowHeight = Math.floor(screenHeight * 0.8);
    
    // Center the window
    const x = Math.floor((screenWidth - windowWidth) / 2);
    const y = Math.floor((screenHeight - windowHeight) / 2);

    welcomeWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: x,
      y: y,
      minWidth: 1200,
      minHeight: 800,
      transparent: true,
      backgroundColor: '#00000000',
      frame: true,
      titleBarStyle: 'default',
      roundedCorners: true,
      title: 'Welcome to Nuru Browser',
      resizable: true,
      maximizable: true,
      minimizable: true,
      closable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        sandbox: false, 
        spellcheck: false,
        devTools: false
      }
    });

    // Load the welcome page HTML file
    const welcomePath = path.join(__dirname, 'renderer', 'welcome-page.html');
    log.info(`Loading welcome page from: ${welcomePath}`);
    
    if (!fs.existsSync(welcomePath)) {
      throw new Error('Welcome page HTML file not found');
    }
    
    welcomeWindow.loadFile(welcomePath);
    
    // Log when window is ready
    welcomeWindow.webContents.on('did-finish-load', () => {
      log.info('Welcome window loaded successfully');
    });

    // Handle load errors
    welcomeWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      log.error(`Failed to load welcome window: ${errorDescription} (${errorCode})`);
      dialog.showErrorBox('Welcome Page Error', `Failed to load: ${errorDescription}`);
    });
    
    // Cleanup when window is closed
    welcomeWindow.on('closed', () => {
      log.info('Welcome window closed');
      welcomeWindow = null;
    });
  } catch (error) {
    log.error(`Error creating welcome window: ${error.message}`);
    dialog.showErrorBox('Welcome Page Error', `Could not open welcome page: ${error.message}`);
  }
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

// Start page navigation handler
ipcMain.handle('navigate-to-url', (event, url) => {
  try {
    log.info(`Start page navigation to: ${url}`);
    
    // Handle special URLs
    if (url === 'nuru://start') {
      // Send the start page URL to the renderer to load in webview
      if (mainWindow) {
        const startPagePath = path.join(__dirname, 'renderer', 'start-page.html').replace(/\\/g, '/');
        mainWindow.webContents.send('navigate-to-url', 'file://' + startPagePath);
        return { success: true };
      }
    }
    
    // Handle regular URLs - create a new tab
    if (mainWindow) {
      mainWindow.webContents.send('navigate-to-url', url);
      return { success: true };
    }
    
    return { success: false, error: 'Main window not available' };
  } catch (error) {
    log.error('Error navigating to URL:', error);
    return { success: false, error: error.message };
  }
});

// Open new tab handler
ipcMain.handle('open-new-tab', (event, url = 'https://www.google.com') => {
  try {
    log.info(`Opening new tab with URL: ${url}`);
    if (mainWindow) {
      mainWindow.webContents.send('open-new-tab', url);
      return { success: true };
    }
    return { success: false, error: 'Main window not available' };
  } catch (error) {
    log.error('Error opening new tab:', error);
    return { success: false, error: error.message };
  }
});

// Show downloads handler
ipcMain.handle('show-downloads', () => {
  try {
    log.info('Showing downloads panel');
    if (mainWindow) {
      mainWindow.webContents.send('show-downloads');
      return { success: true };
    }
    return { success: false, error: 'Main window not available' };
  } catch (error) {
    log.error('Error showing downloads:', error);
    return { success: false, error: error.message };
  }
});

// Open settings handler
ipcMain.handle('open-settings', () => {
  try {
    log.info('Opening settings');
    if (mainWindow) {
      mainWindow.webContents.send('show-settings');
      return { success: true };
    }
    return { success: false, error: 'Main window not available' };
  } catch (error) {
    log.error('Error opening settings:', error);
    return { success: false, error: error.message };
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

    // Update theme setting if provided
    if (newSettings.theme !== undefined) {
      settings.theme = newSettings.theme;
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
    
    // Update cards settings if provided
    if (newSettings.cards) {
      settings.cards = { ...settings.cards, ...newSettings.cards };
    }
    
    // Save all settings to disk
    saveSettings();
    
    // Notify renderer of updated settings
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('settings-updated', settings);
    }
    
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

// Welcome page IPC handlers
ipcMain.handle('check-welcome-completed', () => {
  try {
    // Check if welcome was completed by looking at settings
    const welcomeCompleted = settings.welcomeCompleted || false;
    return { completed: welcomeCompleted };
  } catch (error) {
    log.error('Error checking welcome completion status:', error);
    return { completed: false };
  }
});

ipcMain.on('close-welcome', () => {
  log.info('Closing welcome window and opening main browser');
  if (welcomeWindow) {
    welcomeWindow.close();
  }
  // Create main window if it doesn't exist
  if (!mainWindow) {
    createMainWindow();
  } else {
    mainWindow.focus();
  }
});

// Development: Reset welcome page for testing
ipcMain.handle('reset-welcome', () => {
  try {
    settings.welcomeCompleted = false;
    settings.firstRun = true;
    saveSettings();
    log.info('Welcome page reset for testing');
    return { success: true };
  } catch (error) {
    log.error('Error resetting welcome page:', error);
    return { success: false, error: error.message };
  }
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
  
  // Check if this is a first-time user
  const isFirstTime = !fs.existsSync(SETTINGS_PATH) || 
                     (fs.existsSync(SETTINGS_PATH) && 
                      JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')).firstRun !== false);
  
  // FOR TESTING: Always show welcome page
  const isTesting = true; // Set to false to restore normal behavior
  
  if (isFirstTime || isTesting) {
    log.info('Showing welcome page (first-time user or testing mode)');
    // Mark as not first run
    settings.firstRun = false;
    saveSettings();
    // Show welcome page
    createWelcomeWindow();
  } else {
    log.info('Returning user, opening main browser');
    await createMainWindow();
  }
  
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
    mainWindow.webContents.send('show-settings');
  });
  
  // Add IPC handler for showing settings viewport
  ipcMain.on('show-settings', () => {
    log.info('Showing settings viewport');
    mainWindow.webContents.send('show-settings');
  });

  // Register download history handlers
  log.info('Registering download history handlers');
  ipcMain.handle('toggle-download-history-card', () => {
    log.info('Toggle download history card handler called');
    toggleDownloadHistoryCard();
    return downloadHistoryCardVisible;
  });
  
  ipcMain.handle('get-download-history', () => {
    return downloadHistory;
  });
  
  ipcMain.handle('clear-download-history', () => {
    log.info('Clear download history handler called');
    return clearDownloadHistory();
  });
  
  // Load download history from persistent storage
  loadDownloadHistory();

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



function toggleDownloadHistoryCard() {
  log.info('Toggle handler invoked');
  downloadHistoryCardVisible = !downloadHistoryCardVisible;
  if (downloadHistoryCardVisible) {
    // Logic to display the download history card
    mainWindow.webContents.send('show-download-history-card', downloadHistory);
  } else {
    // Logic to hide the download history card
    mainWindow.webContents.send('hide-download-history-card');
  }
}

// Load download history from disk
function loadDownloadHistory() {
  try {
    if (fs.existsSync(DOWNLOAD_HISTORY_PATH)) {
      const data = fs.readFileSync(DOWNLOAD_HISTORY_PATH, 'utf8');
      downloadHistory = JSON.parse(data);
      log.info(`Loaded ${downloadHistory.length} download history items`);
    } else {
      log.info('No download history file found, using empty history');
      downloadHistory = [];
      saveDownloadHistory(); // Create the file
    }
  } catch (error) {
    log.error('Failed to load download history:', error);
    downloadHistory = [];
    saveDownloadHistory();
  }
}

// Save download history to disk
function saveDownloadHistory() {
  try {
    log.info('Saving download history to:', DOWNLOAD_HISTORY_PATH);
    
    // Ensure the directory exists
    const historyDir = path.dirname(DOWNLOAD_HISTORY_PATH);
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }
    
    fs.writeFileSync(DOWNLOAD_HISTORY_PATH, JSON.stringify(downloadHistory, null, 2));
    log.info('Download history saved successfully');
  } catch (error) {
    log.error('Failed to save download history:', error);
  }
}

// Clear download history
function clearDownloadHistory() {
  downloadHistory = [];
  saveDownloadHistory();
  log.info('Download history cleared');
  return { success: true };
}

// Track a new download and save to disk
function trackDownload(url) {
  downloadHistory.push({ url, timestamp: new Date() });
  saveDownloadHistory();
  
  // If the download history card is visible, send updated history to the renderer
  if (downloadHistoryCardVisible && mainWindow) {
    log.info('Sending updated download history to renderer');
    mainWindow.webContents.send('download-history-updated', downloadHistory);
  }
}
