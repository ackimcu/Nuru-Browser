/**
 * Nuru Browser Ad Blocker
 * A native ad-blocking implementation that filters requests based on common blocklists
 */

const { session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Initialize logging
const log = require('electron-log');
log.transports.file.fileName = 'nuru-ad-blocker.log';

// Ad blocker configuration
const config = {
  enabled: true,
  filterLists: [
    {
      name: 'EasyList',
      url: 'https://easylist.to/easylist/easylist.txt',
      updateInterval: 7 * 24 * 60 * 60 * 1000 // 1 week
    },
    {
      name: 'EasyPrivacy',
      url: 'https://easylist.to/easylist/easyprivacy.txt',
      updateInterval: 7 * 24 * 60 * 60 * 1000 // 1 week
    }
  ],
  customFiltersDir: null, // Will be set during initialization
  cacheDir: null, // Will be set during initialization
  lastUpdate: 0,
  statistics: {
    blocked: 0,
    total: 0,
    startTime: Date.now()
  }
};

// In-memory blocklist patterns
let blockPatterns = {
  domains: new Set(),
  urlPatterns: []
};

/**
 * Initialize the ad blocker
 * @param {string} userDataPath - Path to the user data directory
 * @param {string} cacheDir - Optional specific cache directory to use
 * @returns {Promise<Object>} - Configuration object
 */
async function initialize(userDataPath, cacheDir) {
  // Store user data path for future reference
  config.userDataPath = userDataPath;
  
  // Set cache directory (use provided one or create default)
  config.cacheDir = cacheDir || path.join(userDataPath, 'ad-blocker-cache');
  
  // Create cache directory if it doesn't exist
  if (!fs.existsSync(config.cacheDir)) {
    fs.mkdirSync(config.cacheDir, { recursive: true });
    log.info(`Created ad blocker cache directory at ${config.cacheDir}`);
  }
  
  // Initialize user settings if not already defined
  if (!config.userSettings) {
    config.userSettings = {
      enabled: config.enabled,
      customFilters: []
    };
    
    // Try to load saved settings if they exist
    try {
      const settingsPath = path.join(config.cacheDir, 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (savedSettings) {
          Object.assign(config.userSettings, savedSettings);
          config.enabled = config.userSettings.enabled; // Apply saved enabled state
          log.info('Loaded saved ad blocker settings');
        }
      }
    } catch (err) {
      log.error('Error loading ad blocker settings:', err);
    }
  }
  
  // Create custom filters directory if it doesn't exist
  if (!fs.existsSync(config.customFiltersDir)) {
    config.customFiltersDir = path.join(userDataPath, 'ad-blocker-filters');
    fs.mkdirSync(config.customFiltersDir, { recursive: true });
  }
  
  // Load cached blocklists or download new ones
  await loadBlocklists();
  
  // Load custom filters
  loadCustomFilters();
  
  // Set up the request filter
  setupRequestFilter();
  
  log.info('Ad Blocker initialized');
  return config;
}

/**
 * Load blocklists from cache or download if needed
 * @returns {Promise<void>}
 */
async function loadBlocklists() {
  const now = Date.now();
  let needsUpdate = false;
  
  // Reset in-memory patterns before loading
  blockPatterns.domains.clear();
  blockPatterns.urlPatterns = [];
  
  // Check if we need to update any blocklists
  for (const list of config.filterLists) {
    const cacheFile = path.join(config.cacheDir, `${list.name.toLowerCase()}.txt`);
    const metaFile = path.join(config.cacheDir, `${list.name.toLowerCase()}.meta.json`);
    
    let metadata = { lastUpdate: 0 };
    
    if (fs.existsSync(metaFile)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      } catch (err) {
        log.error(`Error reading metadata for ${list.name}:`, err);
      }
    }
    
    // Update if file doesn't exist or is outdated
    if (!fs.existsSync(cacheFile) || (now - metadata.lastUpdate > list.updateInterval)) {
      log.info(`Downloading blocklist: ${list.name}`);
      try {
        await downloadList(list.url, cacheFile);
        
        // Update metadata
        metadata.lastUpdate = now;
        fs.writeFileSync(metaFile, JSON.stringify(metadata));
        
        needsUpdate = true;
      } catch (err) {
        log.error(`Error downloading ${list.name}:`, err);
        
        // If download fails but we have a cached version, use that
        if (!fs.existsSync(cacheFile)) {
          log.warn(`No cached version of ${list.name} available`);
          continue;
        }
      }
    }
    
    // Parse the blocklist
    if (fs.existsSync(cacheFile)) {
      parseBlocklist(cacheFile);
    }
  }
  
  if (needsUpdate) {
    config.lastUpdate = now;
  }
  
  log.info(`Loaded ${blockPatterns.domains.size} domain rules and ${blockPatterns.urlPatterns.length} URL patterns`);
}

/**
 * Download a list from a URL and save it to a file
 * @param {string} url - URL to download from
 * @param {string} destination - File path to save to
 * @returns {Promise<void>}
 */
function downloadList(url, destination) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download, status code: ${response.statusCode}`));
        return;
      }
      
      const file = fs.createWriteStream(destination);
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(destination, () => {});
      reject(err);
    });
  });
}

/**
 * Parse a blocklist file and add patterns to memory
 * @param {string} filePath - Path to the blocklist file
 */
function parseBlocklist(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('!') || line.startsWith('[') || line.trim() === '') {
        continue;
      }
      
      // Handle domain blocks (||example.com^)
      if (line.startsWith('||') && line.includes('^')) {
        const domain = line.substring(2, line.indexOf('^'));
        blockPatterns.domains.add(domain);
      }
      // Handle basic URL pattern blocks
      else if (!line.startsWith('!') && !line.includes('##') && !line.includes('#@#')) {
        // Convert some AdBlock Plus syntax to regex patterns where possible
        let pattern = line.replace(/\./g, '\\.')
                         .replace(/\*/g, '.*')
                         .replace(/\^/g, '([?/]|$)');
        
        // If it looks like a valid pattern, add it
        if (pattern.length > 2 && !pattern.includes('!') && !pattern.includes('#')) {
          blockPatterns.urlPatterns.push(new RegExp(pattern, 'i'));
        }
      }
    }
  } catch (err) {
    log.error(`Error parsing blocklist ${filePath}:`, err);
  }
}

/**
 * Set up the request filter on all sessions
 */
function setupRequestFilter() {
  // Apply to default session
  applyFilterToSession(session.defaultSession);
  
  // Also apply to any future sessions
  session.on('created', applyFilterToSession);
}

/**
 * Apply the filter to a specific session
 * @param {Electron.Session} session - The session to apply the filter to
 */
function applyFilterToSession(session) {
  session.webRequest.onBeforeRequest((details, callback) => {
    if (!config.enabled) {
      callback({ cancel: false });
      return;
    }
    
    config.statistics.total++;
    
    try {
      // Whitelist local files and app resources
      if (details.url.startsWith('file://') || 
          details.url.startsWith('chrome-extension://') || 
          details.url.includes('devtools://') ||
          details.url.includes('chrome-devtools://')) {
        callback({ cancel: false });
        return;
      }
      
      const url = new URL(details.url);
      
      // Whitelist favicons and common resources
      if (details.url.includes('/favicon.ico') || 
          details.url.endsWith('.ico') ||
          details.url.includes('font-awesome') ||
          details.url.includes('fonts.googleapis.com') ||
          details.url.includes('fonts.gstatic.com') ||
          url.pathname.includes('css') ||
          url.pathname.includes('font')) {
        callback({ cancel: false });
        return;
      }
      
      // Check domain blocks
      if (blockPatterns.domains.has(url.hostname) || 
          blockPatterns.domains.has(url.hostname.replace(/^www\./, ''))) {
        config.statistics.blocked++;
        log.debug(`Blocked domain: ${url.hostname}`);
        callback({ cancel: true });
        return;
      }
      
      // Check URL pattern blocks
      for (const pattern of blockPatterns.urlPatterns) {
        if (pattern.test(details.url)) {
          config.statistics.blocked++;
          log.debug(`Blocked URL pattern: ${details.url}`);
          callback({ cancel: true });
          return;
        }
      }
    } catch (err) {
      log.error('Error in ad blocker:', err);
    }
    
    // Allow the request
    callback({ cancel: false });
  });
}

/**
 * Ensures the ad blocker is properly initialized with correct paths
 * Can be called at any time to fix path issues
 * @param {string} userDataPath - Path to the user data directory
 * @param {string} cacheDir - Path to the cache directory
 */
function ensureInitialized(userDataPath, cacheDir) {
  if (!userDataPath) {
    log.error('Cannot initialize ad blocker: userDataPath is required');
    return;
  }
  
  // Store user data path for future reference
  config.userDataPath = userDataPath;
  
  // Set cache directory (use provided one or create default)
  config.cacheDir = cacheDir || path.join(userDataPath, 'cache', 'adblock');
  
  // Create cache directory if it doesn't exist
  try {
    if (!fs.existsSync(config.cacheDir)) {
      fs.mkdirSync(config.cacheDir, { recursive: true });
      log.info(`Created ad blocker cache directory at ${config.cacheDir}`);
    }
    
    // Create custom filters directory if it doesn't exist
    config.customFiltersDir = path.join(userDataPath, 'ad-blocker-filters');
    if (!fs.existsSync(config.customFiltersDir)) {
      fs.mkdirSync(config.customFiltersDir, { recursive: true });
    }
    
    // Initialize user settings if not already defined
    if (!config.userSettings) {
      config.userSettings = {
        enabled: config.enabled,
        customFilters: []
      };
    }
    
    log.info('Ad Blocker paths and settings ensured');
  } catch (error) {
    log.error('Error ensuring ad blocker initialization:', error);
  }
}

/**
 * Validates and sanitizes settings to prevent errors
 * @param {Object} settings - Settings to validate
 * @returns {Object} - Validated settings
 */
function validateSettings(settings) {
  const defaults = {
    enabled: true,
    customFilters: []
  };
  
  // Start with defaults
  const validated = {...defaults};
  
  if (settings) {
    // Validate boolean values
    if (typeof settings.enabled === 'boolean') {
      validated.enabled = settings.enabled;
    }
    
    // Validate arrays
    if (Array.isArray(settings.customFilters)) {
      validated.customFilters = settings.customFilters;
    }
  }
  
  return validated;
}

/**
 * Update ad blocker settings
 * @param {Object} newSettings - New settings object
 */
function updateSettings(newSettings) {
  // Make sure paths are initialized
  if (!config.cacheDir || !config.userDataPath) {
    log.warn('Paths not initialized during settings update, attempting to fix');
    if (typeof ensureInitialized === 'function') {
      const { app } = require('electron');
      ensureInitialized(app.getPath('userData'), null);
    }
  }
  
  // Validate and update settings in memory
  const validatedSettings = validateSettings(newSettings);
  
  // Initialize userSettings if needed
  if (!config.userSettings) {
    config.userSettings = {
      enabled: config.enabled,
      customFilters: []
    };
  }
  
  // Update with validated settings
  Object.assign(config.userSettings, validatedSettings);
  log.info('Ad Blocker settings updated in memory');
  
  try {
    // Ensure cache directory exists
    if (config.cacheDir) {
      fs.mkdirSync(config.cacheDir, { recursive: true });
      
      // Save settings to file
      const settingsPath = path.join(config.cacheDir, 'settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify(config.userSettings, null, 2));
      log.info('Ad Blocker settings saved to disk');
    } else {
      log.error('Cannot save settings: cacheDir not available');
    }
  } catch (error) {
    log.error('Error saving ad blocker settings:', error);
  }
}

/**
 * Enable or disable the ad blocker
 * @param {boolean} enabled - Whether to enable or disable
 */
function setEnabled(enabled) {
  config.enabled = enabled;
  log.info(`Ad Blocker ${enabled ? 'enabled' : 'disabled'}`);
  
  // Update settings
  updateSettings({ enabled });
}

/**
 * Load custom filter rules
 */
function loadCustomFilters() {
  try {
    const metadataPath = path.join(config.customFiltersDir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      // Create default metadata file
      fs.writeFileSync(metadataPath, JSON.stringify([]));
      log.info('Created empty custom filters metadata file');
      return;
    }
    
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    if (!Array.isArray(metadata) || metadata.length === 0) {
      return;
    }
    
    log.info(`Found ${metadata.length} custom filters`);
    
    // Process each custom filter
    for (const filter of metadata) {
      if (!filter.enabled) continue;
      
      const filterPath = path.join(config.customFiltersDir, filter.id);
      if (fs.existsSync(filterPath)) {
        parseBlocklist(filterPath);
      }
    }
  } catch (err) {
    log.error('Error loading custom filters:', err);
  }
}

/**
 * Add a custom filter rule
 * @param {string} rule - Filter rule to add
 * @returns {Promise<Object>} - Result of the operation
 */
async function addCustomFilter(rule) {
  try {
    // Validate rule format
    if (!rule || typeof rule !== 'string' || rule.trim() === '') {
      return { success: false, error: 'Invalid filter rule' };
    }
    
    // Create a unique ID for the filter
    const filterId = `custom_${Date.now()}`;
    const filterPath = path.join(config.customFiltersDir, filterId);
    
    // Save the filter rule to disk
    fs.writeFileSync(filterPath, rule);
    
    // Update metadata
    const metadataPath = path.join(config.customFiltersDir, 'metadata.json');
    let metadata = [];
    
    if (fs.existsSync(metadataPath)) {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (!Array.isArray(metadata)) metadata = [];
    }
    
    metadata.push({
      id: filterId,
      rule: rule,
      enabled: true,
      added: Date.now()
    });
    
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    // Parse and load the new filter rule
    parseBlocklist(filterPath);
    
    log.info(`Added custom filter: ${rule}`);
    return { success: true, id: filterId };
  } catch (err) {
    log.error('Error adding custom filter:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Remove a custom filter rule
 * @param {string} id - ID of the filter to remove
 * @returns {Promise<Object>} - Result of the operation
 */
async function removeCustomFilter(id) {
  try {
    // Validate ID
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid filter ID' };
    }
    
    const filterPath = path.join(config.customFiltersDir, id);
    const metadataPath = path.join(config.customFiltersDir, 'metadata.json');
    
    // Check if filter exists
    if (!fs.existsSync(metadataPath)) {
      return { success: false, error: 'No custom filters found' };
    }
    
    // Update metadata
    let metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    if (!Array.isArray(metadata)) {
      return { success: false, error: 'Invalid metadata format' };
    }
    
    const filterIndex = metadata.findIndex(filter => filter.id === id);
    if (filterIndex === -1) {
      return { success: false, error: 'Filter not found' };
    }
    
    // Remove the filter from metadata
    const removedFilter = metadata.splice(filterIndex, 1)[0];
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    // Delete the filter file
    if (fs.existsSync(filterPath)) {
      fs.unlinkSync(filterPath);
    }
    
    log.info(`Removed custom filter: ${removedFilter.rule}`);
    
    // Reload all filters to update in-memory patterns
    // Clear patterns first
    blockPatterns.domains.clear();
    blockPatterns.urlPatterns = [];
    
    // Load blocklists
    await loadBlocklists();
    loadCustomFilters();
    
    return { success: true };
  } catch (err) {
    log.error('Error removing custom filter:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Force update of all blocklists
 * @returns {Promise<void>}
 */
async function forceUpdate() {
  // Delete cached files to force re-download
  for (const list of config.filterLists) {
    const cacheFile = path.join(config.cacheDir, `${list.name.toLowerCase()}.txt`);
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }
    
    const metaFile = path.join(config.cacheDir, `${list.name.toLowerCase()}.meta.json`);
    if (fs.existsSync(metaFile)) {
      fs.unlinkSync(metaFile);
    }
  }
  
  // Clear in-memory patterns
  blockPatterns.domains.clear();
  blockPatterns.urlPatterns = [];
  
  // Reload blocklists
  await loadBlocklists();
  
  // Reload custom filters
  loadCustomFilters();
  
  log.info('Ad Blocker lists updated');
}

/**
 * Get current statistics
 * @returns {Object} Statistics object
 */
function getStatistics() {
  return {
    ...config.statistics,
    blockRate: config.statistics.total > 0 
      ? (config.statistics.blocked / config.statistics.total * 100).toFixed(1) + '%' 
      : '0%',
    runTime: Math.floor((Date.now() - config.statistics.startTime) / 1000),
    lastUpdate: config.lastUpdate
  };
}

/**
 * Get the preload script for the ad blocker
 * @returns {string} - JavaScript to inject into webviews
 */
function getPreloadScript() {
  return `
    // Ad blocker integration for renderer process
    window.adBlocker = (() => {
      return {
        // Interface for renderer process to communicate with main process
        getStats: () => {
          return window.nuru.getAdBlockerStats();
        }
      };
    })();
  `;
}

module.exports = {
  initialize,
  applyFilterToSession,
  addCustomFilter,
  removeCustomFilter,
  getStatistics,
  getPreloadScript,
  setEnabled,
  updateSettings,
  forceUpdate,
  ensureInitialized,
  resetToDefaults: () => updateSettings(validateSettings()),
  enabled: config.enabled
};
