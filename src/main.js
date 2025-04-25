const { app, BrowserWindow, globalShortcut, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const features = require('./features/index'); // Import native features
const settingsModal = require('./settings-modal'); // Import settings modal

// Determine if running in production environment
const isProduction = process.env.NODE_ENV === 'production' || app.isPackaged;

// Configure logging
log.transports.file.level = 'debug';
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s} [{level}] {text}';
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'nuru_browser.log');

// Settings configuration
const SETTINGS_PATH = path.join(app.getPath('userData'), 'nuru_browser_settings.json');
const DEFAULT_SETTINGS = {
  dark_mode: true,
  frameless: true,
  zoom_factor: 1.5,
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
  development_mode: false, // Added development mode setting
  features: {
    adBlocker: {
      enabled: true
    },
    sponsorSkipper: {
      enabled: true,
      categories: {
        sponsor: { skip: true, notification: true },
        selfpromo: { skip: true, notification: true },
        interaction: { skip: true, notification: true },
        intro: { skip: true, notification: true },
        outro: { skip: true, notification: true },
        preview: { skip: true, notification: true },
        music_offtopic: { skip: false, notification: true }
      }
    },
    darkMode: {
      enabled: true,
      autoDetect: true,
      brightnessReduction: 85,
      contrastEnhancement: 10
    }
  }
};

let mainWindow;
let diagnosticsWindow;
let settings = DEFAULT_SETTINGS;

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = fs.readFileSync(SETTINGS_PATH, 'utf8');
      const loadedSettings = JSON.parse(data);
      settings = { ...DEFAULT_SETTINGS, ...loadedSettings };
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
  // Initialize native features before creating the window
  try {
    const featuresConfig = await features.initialize();
    log.info('Native features initialized successfully');
    
    // Update settings with feature configurations if needed
    if (!settings.features) {
      settings.features = {
        adBlocker: { enabled: featuresConfig.adBlocker.enabled },
        sponsorSkipper: { enabled: featuresConfig.sponsorSkipper.enabled, categories: featuresConfig.sponsorSkipper.userSettings },
        darkMode: { 
          enabled: featuresConfig.darkMode.enabled, 
          autoDetect: featuresConfig.darkMode.autoDetect,
          brightnessReduction: featuresConfig.darkMode.brightnessReduction,
          contrastEnhancement: featuresConfig.darkMode.contrastEnhancement
        }
      };
      saveSettings();
    }
  } catch (error) {
    log.error('Failed to initialize native features:', error);
  }
  
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
      webSecurity: false, // Allow loading content from different origins
      plugins: true,
      experimentalFeatures: false,
      webviewTag: true, // Explicitly enable webview tag
      allowRunningInsecureContent: true // Allow mixed content
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
      width: 800,
      height: 700,
      minWidth: 600,
      minHeight: 500,
      backgroundColor: '#1a1a1a',
      title: 'Nuru Browser - Diagnostics',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath,
        sandbox: false, // Disable sandbox to allow access to Node.js modules
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

// Update download/install handlers
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
    
    // Update settings object with new values
    if (newSettings.browser) {
      // Update browser settings
      Object.assign(settings, newSettings.browser);
      
      // Apply zoom immediately if changed
      if (newSettings.browser.zoom_factor && mainWindow) {
        mainWindow.webContents.setZoomFactor(newSettings.browser.zoom_factor);
      }
    }
    
    // Update features settings if available
    if (newSettings.features && features) {
      // Update ad blocker settings
      if (newSettings.features.adBlocker && features.adBlocker) {
        features.adBlocker.setEnabled(newSettings.features.adBlocker.enabled);
        settings.features.adBlocker = newSettings.features.adBlocker;
      }
      
      // Update sponsor skipper settings
      if (newSettings.features.sponsorSkipper && features.sponsorSkipper) {
        features.sponsorSkipper.setEnabled(newSettings.features.sponsorSkipper.enabled);
        if (newSettings.features.sponsorSkipper.categories) {
          features.sponsorSkipper.updateSettings(newSettings.features.sponsorSkipper.categories);
        }
        settings.features.sponsorSkipper = newSettings.features.sponsorSkipper;
      }
      
      // Update dark mode settings
      if (newSettings.features.darkMode && features.darkMode) {
        features.darkMode.setEnabled(newSettings.features.darkMode.enabled);
        features.darkMode.updateSettings({
          autoDetect: newSettings.features.darkMode.autoDetect,
          brightnessReduction: newSettings.features.darkMode.brightnessReduction,
          contrastEnhancement: newSettings.features.darkMode.contrastEnhancement
        });
        settings.features.darkMode = newSettings.features.darkMode;
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
      darkMode: settings.dark_mode,
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

ipcMain.handle('set-dark-mode', async (event, darkMode) => {
  settings.dark_mode = darkMode;
  saveSettings();
  
  // Update enhanced dark mode feature if it's initialized
  if (features && features.darkMode) {
    features.darkMode.setEnabled(darkMode);
  }
  
  // Notify renderer
  if (mainWindow) {
    mainWindow.webContents.send('dark-mode-changed', darkMode);
  }
  
  return darkMode;
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

app.whenReady().then(async () => {
  // Load settings
  loadSettings();
  
  // Create main window (now async to handle feature initialization)
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
    settingsModal.showSettingsModal(mainWindow, settings, features);
  });
  
  // Add IPC handler for showing settings modal
  ipcMain.on('show-settings', () => {
    log.info('Showing settings modal');
    settingsModal.showSettingsModal(mainWindow, settings, features);
  });

  // Set up native features from settings
  if (features && settings.features) {
    try {
      // Apply ad blocker settings
      if (settings.features.adBlocker) {
        features.adBlocker.setEnabled(settings.features.adBlocker.enabled);
      }
      
      // Apply sponsor skipper settings
      if (settings.features.sponsorSkipper) {
        features.sponsorSkipper.setEnabled(settings.features.sponsorSkipper.enabled);
        if (settings.features.sponsorSkipper.categories) {
          features.sponsorSkipper.updateSettings(settings.features.sponsorSkipper.categories);
        }
      }
      
      // Apply dark mode settings
      if (settings.features.darkMode) {
        features.darkMode.setEnabled(settings.features.darkMode.enabled);
        features.darkMode.updateSettings({
          autoDetect: settings.features.darkMode.autoDetect,
          brightnessReduction: settings.features.darkMode.brightnessReduction,
          contrastEnhancement: settings.features.darkMode.contrastEnhancement
        });
      }
      
      log.info('Native features configured from settings');
    } catch (error) {
      log.error('Error applying feature settings:', error);
    }
  }

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
  
  // Save feature statistics if available
  if (features) {
    try {
      const stats = features.getStatistics();
      log.info('Feature statistics at exit:', JSON.stringify(stats, null, 2));
    } catch (error) {
      log.error('Error saving feature statistics:', error);
    }
  }
});
