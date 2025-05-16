/**
 * Nuru Browser Features Integration
 * This module integrates all native features (sponsor skipper, dark mode)
 * with the main Electron application.
 */

const { app, ipcMain, webContents } = require('electron');
const path = require('path');

// Initialize logging
const log = require('electron-log');
log.transports.file.fileName = 'nuru-features.log';

// Features configuration and state
let features = {
  initialized: false,
  userDataPath: null,
  config: {
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
    
    // Ensure all features are properly initialized
    ensureFeaturesInitialized();
    
    features.initialized = true;
    log.info('All features initialized successfully');
    
    return features.config;
  } catch (err) {
    log.error('Error initializing features:', err);
    features.initialized = false;
    return {};
  }
}

/**
 * Set up IPC handlers for renderer processes to communicate with features
 */
function setupIPCHandlers() {
}

/**
 * Set up handlers for webContents
 */
function setupWebContentsHandlers() {
  // Handle new webContents creation
  app.on('web-contents-created', (event, contents) => {
    // Skip non-webview contents
    if (contents.getType() !== 'webview') return;
    
    // Handle page loading and rendering
    contents.on('did-start-loading', () => {
      log.debug(`Page started loading: ${contents.getURL()}`);
    });
    
    contents.on('did-finish-load', () => {
      const url = contents.getURL();
      log.debug(`Page finished loading: ${url}`);
    });
    
    // Handle IPC messages from renderer process
    contents.on('ipc-message', (event, channel, ...args) => {
    });
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
  return {};
 }

module.exports = {
  initialize: async () => ({}),
  getConfig: () => ({}),
  getStatistics: () => ({}),
  ensureFeaturesInitialized: () => {}
};
