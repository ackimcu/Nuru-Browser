/**
 * Nuru Browser Features Integration
 * This module integrates all native features (ad blocker, sponsor skipper, dark mode)
 * with the main Electron application.
 */

const { app, ipcMain, webContents } = require('electron');
const path = require('path');

// Import feature modules
const adBlocker = require('./ad-blocker');
const sponsorSkipper = require('./sponsor-skipper');
const darkMode = require('./dark-mode');

// Initialize logging
const log = require('electron-log');
log.transports.file.fileName = 'nuru-features.log';

// Features configuration and state
let features = {
  initialized: false,
  userDataPath: null,
  config: {
    adBlocker: null,
    sponsorSkipper: null,
    darkMode: null
  }
};

/**
 * Initialize all features
 * @returns {Promise<Object>} - Features configuration
 */
async function initialize() {
  // Set up IPC handlers immediately to handle early calls
  setupIPCHandlers();
  
  if (features.initialized) {
    return features.config;
  }
  
  try {
    // Get user data path
    features.userDataPath = app.getPath('userData');
    const cachePath = path.join(features.userDataPath, 'cache');
    
    // Create main cache directory if it doesn't exist
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true });
    }
    
    // Ensure feature-specific cache directories exist
    const adBlockerCacheDir = path.join(cachePath, 'adblock');
    const sponsorSkipperCacheDir = path.join(cachePath, 'sponsors');
    const darkModeCacheDir = path.join(cachePath, 'dark-mode');
    
    fs.mkdirSync(adBlockerCacheDir, { recursive: true });
    fs.mkdirSync(sponsorSkipperCacheDir, { recursive: true });
    fs.mkdirSync(darkModeCacheDir, { recursive: true });
    
    log.info(`Cache directories created at ${cachePath}`);
    
    // Ensure all features are properly initialized
    ensureFeaturesInitialized();
    
    // Initialize each feature with their specific cache directory
    features.config.adBlocker = await adBlocker.initialize(features.userDataPath, adBlockerCacheDir);
    features.config.sponsorSkipper = await sponsorSkipper.initialize(features.userDataPath, sponsorSkipperCacheDir);
    features.config.darkMode = await darkMode.initialize(features.userDataPath, darkModeCacheDir);
    
    // Set up webContents handlers
    setupWebContentsHandlers();
    
    features.initialized = true;
    log.info('All features initialized successfully');
    
    return features.config;
  } catch (err) {
    log.error('Error initializing features:', err);
    features.initialized = false;
    return {
      adBlocker: { enabled: false },
      sponsorSkipper: { enabled: false, categories: {} },
      darkMode: { enabled: false }
    };
  }
}

/**
 * Set up IPC handlers for renderer processes to communicate with features
 */
function setupIPCHandlers() {
  // Ad Blocker IPC handlers
  ipcMain.handle('ad-blocker:get-config', () => {
    return adBlocker && features.initialized ? {
      enabled: adBlocker.enabled || false,
      ...features.config.adBlocker
    } : { enabled: false };
  });
  
  ipcMain.handle('ad-blocker:get-stats', () => {
    return adBlocker ? adBlocker.getStatistics() : { blockedRequests: 0, totalRequests: 0 };
  });
  
  ipcMain.handle('ad-blocker:set-enabled', (event, enabled) => {
    if (adBlocker) adBlocker.setEnabled(enabled);
    return { success: !!adBlocker };
  });
  
  ipcMain.handle('ad-blocker:force-update', async () => {
    if (adBlocker) await adBlocker.forceUpdate();
    return { success: !!adBlocker };
  });
  
  // Sponsor Skipper IPC handlers
  ipcMain.handle('sponsor-skipper:get-config', () => {
    return sponsorSkipper && features.initialized ? {
      enabled: sponsorSkipper.enabled || false,
      ...features.config.sponsorSkipper
    } : { enabled: false, categories: {} };
  });
  
  ipcMain.handle('sponsor-skipper:get-stats', () => {
    return sponsorSkipper ? sponsorSkipper.getStatistics() : { skippedSegments: 0, totalSegments: 0 };
  });
  
  ipcMain.handle('sponsor-skipper:set-enabled', (event, enabled) => {
    if (sponsorSkipper) sponsorSkipper.setEnabled(enabled);
    return { success: !!sponsorSkipper };
  });
  
  ipcMain.handle('sponsor-skipper:update-settings', (event, settings) => {
    if (sponsorSkipper) sponsorSkipper.updateSettings(settings);
    return { success: !!sponsorSkipper };
  });
  
  ipcMain.handle('sponsor-skipper:clear-cache', () => {
    if (sponsorSkipper) sponsorSkipper.clearCache();
    return { success: !!sponsorSkipper };
  });
  
  // Dark Mode IPC handlers
  ipcMain.handle('dark-mode:get-config', () => {
    return darkMode && features.initialized ? {
      enabled: darkMode.enabled || false,
      ...features.config.darkMode
    } : { enabled: false, autoDetect: true, brightnessReduction: 85, contrastEnhancement: 10 };
  });
  
  ipcMain.handle('dark-mode:get-stats', () => {
    return darkMode ? darkMode.getStatistics() : { appliedSites: 0, totalSites: 0 };
  });
  
  ipcMain.handle('dark-mode:set-enabled', (event, enabled) => {
    if (darkMode) darkMode.setEnabled(enabled);
    return { success: !!darkMode };
  });
  
  ipcMain.handle('dark-mode:update-settings', (event, settings) => {
    if (darkMode) darkMode.updateSettings(settings);
    return { success: !!darkMode };
  });
  
  ipcMain.handle('dark-mode:add-dark-site', (event, site) => {
    if (darkMode) darkMode.addUserDarkSite(site);
    return { success: !!darkMode };
  });
  
  ipcMain.handle('dark-mode:add-excluded-site', (event, site) => {
    if (darkMode) darkMode.addExcludedSite(site);
    return { success: !!darkMode };
  });
  
  ipcMain.handle('dark-mode:remove-dark-site', (event, site) => {
    if (darkMode) darkMode.removeUserDarkSite(site);
    return { success: !!darkMode };
  });
  
  ipcMain.handle('dark-mode:remove-excluded-site', (event, site) => {
    if (darkMode) darkMode.removeExcludedSite(site);
    return { success: !!darkMode };
  });
}

/**
 * Set up handlers for webContents
 */
function setupWebContentsHandlers() {
  // Handle new webContents creation
  app.on('web-contents-created', (event, contents) => {
    // Skip non-webview contents
    if (contents.getType() !== 'webview') return;
    
    // Prepare combined preload script for features
    setupFeaturePreloads(contents);
    
    // Handle page loading and rendering
    contents.on('did-start-loading', () => {
      log.debug(`Page started loading: ${contents.getURL()}`);
    });
    
    contents.on('did-finish-load', () => {
      const url = contents.getURL();
      log.debug(`Page finished loading: ${url}`);
      
      // Apply dark mode if needed
      const darkModeResult = darkMode.processUrl(url);
      contents.send('dark-mode-config', {
        type: 'dark-mode-config',
        enabled: features.config.darkMode.enabled,
        shouldApply: darkModeResult.shouldApply,
        css: darkModeResult.shouldApply ? features.config.darkMode.darkModeCSS : null
      });
    });
    
    // Handle IPC messages from renderer process
    contents.on('ipc-message', (event, channel, ...args) => {
      // Handle Sponsor Skipper messages
      if (channel === 'sponsor-video-detected') {
        handleSponsorVideoDetected(contents, args[0]);
      } else if (channel === 'sponsor-segment-skipped') {
        sponsorSkipper.recordSkippedSegment(args[0].category);
      }
      
      // Handle Dark Mode messages
      else if (channel === 'dark-mode-detection-result') {
        if (args[0].hasDarkMode) {
          // If the site has dark mode, add it to the dark sites list
          const hostname = new URL(args[0].url).hostname;
          darkMode.addUserDarkSite(hostname);
        }
      } else if (channel === 'dark-mode-url-changed') {
        const url = args[0].url;
        const darkModeResult = darkMode.processUrl(url);
        contents.send('dark-mode-config', {
          type: 'dark-mode-config',
          enabled: features.config.darkMode.enabled,
          shouldApply: darkModeResult.shouldApply,
          css: darkModeResult.shouldApply ? features.config.darkMode.darkModeCSS : null
        });
      } else if (channel === 'dark-mode-applied') {
        // Dark mode was applied to a page
        log.debug(`Dark mode applied to: ${args[0].url}`);
      } else if (channel === 'dark-mode-enable') {
        darkMode.setEnabled(true);
        const url = args[0].url;
        const darkModeResult = darkMode.processUrl(url);
        contents.send('dark-mode-config', {
          type: 'dark-mode-config',
          enabled: true,
          shouldApply: darkModeResult.shouldApply,
          css: darkModeResult.shouldApply ? features.config.darkMode.darkModeCSS : null
        });
      } else if (channel === 'dark-mode-disable') {
        darkMode.setEnabled(false);
        contents.send('dark-mode-config', {
          type: 'dark-mode-config',
          enabled: false,
          shouldApply: false
        });
      } else if (channel === 'dark-mode-toggle') {
        const newEnabled = !features.config.darkMode.enabled;
        darkMode.setEnabled(newEnabled);
        const url = args[0].url;
        const darkModeResult = newEnabled ? darkMode.processUrl(url) : { shouldApply: false };
        contents.send('dark-mode-config', {
          type: 'dark-mode-config',
          enabled: newEnabled,
          shouldApply: darkModeResult.shouldApply,
          css: darkModeResult.shouldApply ? features.config.darkMode.darkModeCSS : null
        });
      }
    });
  });
}

/**
 * Handle sponsor video detection from renderer
 * @param {Electron.WebContents} contents - The web contents
 * @param {Object} data - The detection data
 */
async function handleSponsorVideoDetected(contents, data) {
  if (!features.config.sponsorSkipper.enabled) return;
  
  try {
    const segments = await sponsorSkipper.fetchSponsorSegments(data.videoId);
    if (segments.length > 0) {
      contents.send('sponsor-segments', {
        type: 'sponsor-segments',
        segments: segments
      });
      
      // Also send current settings
      contents.executeJavaScript(`
        if (window.nurubrowser_sponsorSkipper) {
          window.nurubrowser_sponsorSkipper.updateSettings(${JSON.stringify(features.config.sponsorSkipper.userSettings)});
        }
      `);
    }
  } catch (err) {
    log.error('Error handling sponsor video:', err);
  }
}

/**
 * Set up feature preloads for a webContents
 * @param {Electron.WebContents} contents - The web contents
 */
function setupFeaturePreloads(contents) {
  // Get current preload scripts
  const session = contents.session;
  
  // Create a combined preload script for all features
  const combinedScript = `
    // Nuru Browser Features Preload
    
    // Dark Mode
    ${darkMode.getPreloadScript()}
    
    // Sponsor Skipper
    ${sponsorSkipper.getPreloadScript()}
    
    // Setup two-way communication with main process
    const { ipcRenderer } = require('electron');
    
    // Forward messages from preload scripts to main process
    window.addEventListener('message', (event) => {
      // Only accept messages from this window
      if (event.source !== window) return;
      
      const message = event.data;
      
      // Sponsor Skipper messages
      if (message.type === 'sponsor-video-detected') {
        ipcRenderer.send('sponsor-video-detected', message);
      } else if (message.type === 'sponsor-segment-skipped') {
        ipcRenderer.send('sponsor-segment-skipped', message);
      }
      
      // Dark Mode messages
      else if (message.type === 'dark-mode-detection-result' ||
              message.type === 'dark-mode-url-changed' ||
              message.type === 'dark-mode-applied' ||
              message.type === 'dark-mode-enable' ||
              message.type === 'dark-mode-disable' ||
              message.type === 'dark-mode-toggle') {
        ipcRenderer.send(message.type, message);
      }
    });
    
    // Forward messages from main process to preload scripts
    ipcRenderer.on('sponsor-segments', (event, data) => {
      window.postMessage(data, '*');
    });
    
    ipcRenderer.on('dark-mode-config', (event, data) => {
      window.postMessage(data, '*');
    });
  `;
  
  // Inject the combined script on page creation
  contents.on('dom-ready', () => {
    contents.executeJavaScript(combinedScript, true)
      .catch(err => log.error('Error injecting features script:', err));
  });
}

/**
 * Get all features configuration
 * @returns {Object} - Features configuration
 */
function getConfig() {
  return features.config;
}

/**
 * Ensure all features are properly initialized
 * This can be called at any time to make sure features have proper paths set
 */
function ensureFeaturesInitialized() {
  if (!features.userDataPath) {
    log.warn('Features userDataPath not set, trying to get app data path');
    features.userDataPath = app.getPath('userData');
  }
  
  const cachePath = path.join(features.userDataPath, 'cache');
  
  // Make sure the cache directory exists
  try {
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true });
    }
    
    // Ensure feature-specific cache directories exist
    const adBlockerCacheDir = path.join(cachePath, 'adblock');
    const sponsorSkipperCacheDir = path.join(cachePath, 'sponsors');
    const darkModeCacheDir = path.join(cachePath, 'dark-mode');
    
    fs.mkdirSync(adBlockerCacheDir, { recursive: true });
    fs.mkdirSync(sponsorSkipperCacheDir, { recursive: true });
    fs.mkdirSync(darkModeCacheDir, { recursive: true });
    
    // Make sure feature modules have userDataPath set
    if (adBlocker && typeof adBlocker.ensureInitialized === 'function') {
      adBlocker.ensureInitialized(features.userDataPath, adBlockerCacheDir);
    }
    
    if (sponsorSkipper && typeof sponsorSkipper.ensureInitialized === 'function') {
      sponsorSkipper.ensureInitialized(features.userDataPath, sponsorSkipperCacheDir);
    }
    
    if (darkMode && typeof darkMode.ensureInitialized === 'function') {
      darkMode.ensureInitialized(features.userDataPath, darkModeCacheDir);
    }
    
    log.info('Features paths ensured');
  } catch (error) {
    log.error('Error ensuring feature initialization:', error);
  }
}

/**
 * Get statistics for all features
 * @returns {Object} - Features statistics
 */
function getStatistics() {
  return {
    adBlocker: adBlocker.getStatistics(),
    sponsorSkipper: sponsorSkipper.getStatistics(),
    darkMode: darkMode.getStatistics()
  };
}

module.exports = {
  initialize,
  getConfig,
  getStatistics,
  ensureFeaturesInitialized,
  adBlocker,
  sponsorSkipper,
  darkMode
};
