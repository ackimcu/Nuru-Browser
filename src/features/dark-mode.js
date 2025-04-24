/**
 * Nuru Browser Enhanced Dark Mode
 * A native implementation for automatically applying dark mode to websites
 * with smart detection of sites that already have dark mode
 */

const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Initialize logging
const log = require('electron-log');
log.transports.file.fileName = 'nuru-dark-mode.log';

// Dark Mode configuration
const config = {
  enabled: true,
  autoDetect: true,
  darkSitesList: [
    'youtube.com',
    'netflix.com',
    'spotify.com',
    'discord.com',
    'twitter.com',
    'reddit.com/.*?dark',
    'old.reddit.com/.*?dark',
    'github.com/?.*dark'
  ],
  excludedSites: [
    'docs.google.com'
  ],
  userExcludedSites: [],
  userDarkSites: [],
  darkModeCSS: null, // Will be populated in initialize
  brightnessReduction: 85, // 0-100
  contrastEnhancement: 10, // -100 to 100
  cacheDir: null, // Will be set during initialization
  statistics: {
    sitesModified: 0,
    sitesSkipped: 0,
    startTime: Date.now()
  }
};

// RegExp for sites already in dark mode
let darkSitesRegexes = [];

/**
 * Initialize the dark mode feature
 * @param {string} userDataPath - Path to the user data directory
 * @param {string} cacheDir - Optional specific cache directory to use
 * @returns {Promise<Object>} - Configuration object
 */
async function initialize(userDataPath, cacheDir) {
  // Store user data path
  config.userDataPath = userDataPath;
  
  // Set up cache directory
  config.cacheDir = cacheDir || path.join(userDataPath, 'dark-mode-cache');
  
  // Create cache directory if it doesn't exist
  if (!fs.existsSync(config.cacheDir)) {
    fs.mkdirSync(config.cacheDir, { recursive: true });
    log.info(`Created dark mode cache directory at ${config.cacheDir}`);
  }
  
  // Initialize user settings with defaults
  config.userSettings = {
    autoDetect: true,
    brightnessReduction: 85,
    contrastEnhancement: 10
  };
  
  // Load user site lists if they exist
  try {
    const userListsFile = path.join(config.cacheDir, 'user-lists.json');
    if (fs.existsSync(userListsFile)) {
      const userLists = JSON.parse(fs.readFileSync(userListsFile, 'utf8'));
      if (userLists.userDarkSites) config.userDarkSites = userLists.userDarkSites;
      if (userLists.userExcludedSites) config.userExcludedSites = userLists.userExcludedSites;
    }
  } catch (err) {
    log.error('Error loading user site lists:', err);
  }
  
  // Compile dark sites list into regexes
  compileRegexes();
  
  // Load dark mode CSS
  config.darkModeCSS = generateDarkModeCSS(config.brightnessReduction, config.contrastEnhancement);
  
  // Setup content script injection
  setupContentScripts();
  
  log.info('Enhanced Dark Mode initialized');
  return config;
}

/**
 * Compile the dark sites list into regular expressions
 */
function compileRegexes() {
  const combinedList = [...config.darkSitesList, ...config.userDarkSites];
  
  darkSitesRegexes = combinedList.map(site => {
    try {
      return new RegExp(site, 'i');
    } catch (err) {
      log.error(`Invalid regex pattern: ${site}`, err);
      return null;
    }
  }).filter(Boolean);
  
  log.debug(`Compiled ${darkSitesRegexes.length} dark site patterns`);
}

/**
 * Check if a URL belongs to a site that already has dark mode
 * @param {string} url - The URL to check
 * @returns {boolean} - Whether the site already has dark mode
 */
function isAlreadyDarkSite(url) {
  try {
    // Check if site matches any of the dark site patterns
    for (const regex of darkSitesRegexes) {
      if (regex.test(url)) {
        return true;
      }
    }
    
    // Check special cases for Google domains
    if (url.includes('google.com')) {
      // For Google Search and most Google properties, check URL parameters
      if (url.includes('cs=1') || url.includes('theme=dark')) {
        return true;
      }
    }
    
    return false;
  } catch (err) {
    log.error('Error checking dark site:', err);
    return false;
  }
}

/**
 * Check if a URL belongs to an excluded site
 * @param {string} url - The URL to check
 * @returns {boolean} - Whether the site is excluded
 */
function isExcludedSite(url) {
  const combinedExclusions = [...config.excludedSites, ...config.userExcludedSites];
  
  for (const site of combinedExclusions) {
    if (url.includes(site)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Generate the CSS for dark mode
 * @param {number} brightness - Brightness reduction percentage (0-100)
 * @param {number} contrast - Contrast enhancement percentage (-100 to 100)
 * @returns {string} - CSS for dark mode
 */
function generateDarkModeCSS(brightness, contrast) {
  // Cap values to valid ranges
  brightness = Math.max(0, Math.min(100, brightness));
  contrast = Math.max(-100, Math.min(100, contrast));
  
  // Convert to CSS filter values
  const brightnessValue = 1 - (brightness / 100);
  const contrastValue = 1 + (contrast / 100);
  
  return `
    /* Nuru Browser Enhanced Dark Mode */
    html {
      background-color: #1c1c1c !important;
    }
    
    html, body {
      background-color: #1c1c1c !important;
      color: #ddd !important;
    }
    
    /* Basic elements */
    a {
      color: #6d9eff !important;
    }
    
    /* Images and media */
    img, video, canvas {
      filter: brightness(${brightnessValue > 0.6 ? brightnessValue.toFixed(2) : '0.6'}) !important;
    }
    
    /* Forms and inputs */
    input, textarea, select, button {
      background-color: #333 !important;
      color: #ddd !important;
      border-color: #555 !important;
    }
    
    /* Tables */
    table, th, td {
      background-color: #222 !important;
      color: #ddd !important;
      border-color: #444 !important;
    }
    
    /* Block elements */
    div, section, article, aside, nav, header, footer, main {
      background-color: transparent !important;
      color: #ddd !important;
    }
    
    /* Backgrounds */
    [style*="background-color"] {
      background-image: none !important;
    }
    
    [style*="background-color: #fff"],
    [style*="background-color:#fff"],
    [style*="background-color: white"],
    [style*="background-color:white"],
    [style*="background-color: rgb(255, 255, 255)"],
    [style*="background-color:rgb(255, 255, 255)"],
    [style*="background-color: rgba(255, 255, 255"],
    [style*="background-color:rgba(255, 255, 255"] {
      background-color: #1c1c1c !important;
    }
    
    /* Text colors */
    [style*="color: #000"],
    [style*="color:#000"],
    [style*="color: black"],
    [style*="color:black"],
    [style*="color: rgb(0, 0, 0)"],
    [style*="color:rgb(0, 0, 0)"],
    [style*="color: rgba(0, 0, 0"],
    [style*="color:rgba(0, 0, 0"] {
      color: #ddd !important;
    }
    
    /* Borders */
    [style*="border"] {
      border-color: #444 !important;
    }
    
    /* Transitions and animations */
    * {
      transition-property: none !important;
    }
    
    /* Specific Google sites fixes */
    .RNNXgb {
      background-color: #333 !important;
    }
    
    /* Add specific site fixes here */
    /* ... */
  `;
}

/**
 * Get the preload script content for dark mode injection
 * @returns {string} - JavaScript code as a string
 */
function getPreloadScript() {
  return `
    // Enhanced Dark Mode for Nuru Browser
    (function() {
      const darkModeCSSId = 'nuru-enhanced-dark-mode';
      let darkModeEnabled = true;
      let currentUrl = '';
      let darkModeObserver = null;
      
      // Listen for messages from the main process
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'dark-mode-config') {
          darkModeEnabled = event.data.enabled;
          
          if (darkModeEnabled && event.data.shouldApply) {
            applyDarkMode(event.data.css);
          } else {
            removeDarkMode();
          }
        }
      });
      
      // Apply dark mode to the page
      function applyDarkMode(css) {
        removeDarkMode(); // Remove existing if any
        
        // Create the style element
        const style = document.createElement('style');
        style.id = darkModeCSSId;
        style.textContent = css;
        
        // Add style to document
        document.head.appendChild(style);
        
        // Set up observer to keep dark mode applied on DOM changes
        if (!darkModeObserver) {
          darkModeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              if (mutation.type === 'childList' && mutation.addedNodes.length) {
                ensureDarkModeApplied();
              }
            }
          });
          
          darkModeObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
          });
        }
        
        // Log statistics
        window.postMessage({ 
          type: 'dark-mode-applied',
          url: window.location.href
        }, '*');
      }
      
      // Remove dark mode from the page
      function removeDarkMode() {
        const style = document.getElementById(darkModeCSSId);
        if (style) {
          style.remove();
        }
        
        // Disconnect observer
        if (darkModeObserver) {
          darkModeObserver.disconnect();
          darkModeObserver = null;
        }
      }
      
      // Ensure dark mode stays applied
      function ensureDarkModeApplied() {
        // Check if our style element is still in the document
        if (darkModeEnabled && !document.getElementById(darkModeCSSId)) {
          // Request CSS again from main process
          window.postMessage({ 
            type: 'dark-mode-request-css',
            url: window.location.href
          }, '*');
        }
      }
      
      // Detect page changes in SPAs
      function monitorURLChanges() {
        if (currentUrl !== window.location.href) {
          currentUrl = window.location.href;
          
          // Notify main process about URL change
          window.postMessage({ 
            type: 'dark-mode-url-changed',
            url: currentUrl
          }, '*');
        }
      }
      
      // Set up URL change monitoring
      setInterval(monitorURLChanges, 1000);
      
      // Add API for toggling dark mode from page
      window.nurubrowser_darkMode = {
        enable: () => {
          window.postMessage({ 
            type: 'dark-mode-enable',
            url: window.location.href
          }, '*');
        },
        disable: () => {
          window.postMessage({ 
            type: 'dark-mode-disable',
            url: window.location.href
          }, '*');
        },
        toggle: () => {
          window.postMessage({ 
            type: 'dark-mode-toggle',
            url: window.location.href
          }, '*');
        }
      };
      
      // Detect if site already has dark mode
      function detectExistingDarkMode() {
        try {
          // Method 1: Check for dark mode classes
          const hasCommonDarkClasses = document.documentElement.classList.contains('dark') ||
                                      document.documentElement.classList.contains('dark-mode') ||
                                      document.documentElement.classList.contains('darkmode') ||
                                      document.documentElement.classList.contains('theme-dark') ||
                                      document.body.classList.contains('dark') ||
                                      document.body.classList.contains('dark-mode') ||
                                      document.body.classList.contains('darkmode') ||
                                      document.body.classList.contains('theme-dark');
                                      
          if (hasCommonDarkClasses) {
            return true;
          }
          
          // Method 2: Check for dark background color
          const bodyBgColor = getComputedStyle(document.body).backgroundColor;
          const htmlBgColor = getComputedStyle(document.documentElement).backgroundColor;
          
          function isDarkColor(color) {
            if (!color || color === 'rgba(0, 0, 0, 0)' || color === 'transparent') return false;
            
            // Parse color
            let r, g, b;
            if (color.startsWith('rgb')) {
              const matches = color.match(/rgba?\\s*\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/i);
              if (matches) {
                r = parseInt(matches[1]);
                g = parseInt(matches[2]);
                b = parseInt(matches[3]);
              }
            } else if (color.startsWith('#')) {
              const hex = color.substring(1);
              r = parseInt(hex.substring(0, 2), 16);
              g = parseInt(hex.substring(2, 4), 16);
              b = parseInt(hex.substring(4, 6), 16);
            }
            
            if (r !== undefined) {
              // Calculate luminance
              const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
              return luminance < 0.5; // Dark color
            }
            
            return false;
          }
          
          if (isDarkColor(bodyBgColor) || isDarkColor(htmlBgColor)) {
            return true;
          }
          
          // Method 3: Check for specific site patterns
          if (window.location.hostname.includes('youtube.com') && 
              document.documentElement.getAttribute('dark') === 'true') {
            return true;
          }
          
          // Method 4: Check for dark mode meta tag
          const colorScheme = document.querySelector('meta[name="color-scheme"]');
          if (colorScheme && colorScheme.content.includes('dark')) {
            return true;
          }
          
          // Method 5: Check for dark mode appearance setting in theme-color
          const themeColor = document.querySelector('meta[name="theme-color"]');
          if (themeColor && isDarkColor(themeColor.content)) {
            return true;
          }
          
          return false;
        } catch (err) {
          console.error('Error detecting dark mode:', err);
          return false;
        }
      }
      
      // Initial check for existing dark mode
      window.postMessage({ 
        type: 'dark-mode-detection-result',
        hasDarkMode: detectExistingDarkMode(),
        url: window.location.href
      }, '*');
      
      // Also report initial URL
      window.postMessage({ 
        type: 'dark-mode-url-changed',
        url: window.location.href
      }, '*');
    })();
  `;
}

/**
 * Set up content scripts for all sessions
 */
function setupContentScripts() {
  // Apply to default session
  setupSessionHandler(session.defaultSession);
  
  // Also apply to any future sessions
  session.on('created', setupSessionHandler);
}

/**
 * Set up handlers for a specific session
 * @param {Electron.Session} session - The session to set up
 */
function setupSessionHandler(session) {
  // Handle IPC messages from renderer processes
  session.webRequest.onHeadersReceived((details, callback) => {
    // Only process main frame requests
    if (details.resourceType !== 'mainFrame') {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    
    const url = details.url;
    
    // Skip excluded sites
    if (isExcludedSite(url)) {
      config.statistics.sitesSkipped++;
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    
    // Add a Content-Security-Policy that allows inline styles
    let csp = details.responseHeaders['content-security-policy'] || 
              details.responseHeaders['Content-Security-Policy'];
    
    if (csp) {
      // Modify CSP to allow our inline styles
      const newCSP = Array.isArray(csp) ? csp : [csp];
      
      // Modify each CSP directive
      const modifiedCSP = newCSP.map(policy => {
        // Add 'unsafe-inline' to style-src
        return policy.replace(
          /(style-src[^;]*)(;|$)/,
          '$1 \'unsafe-inline\'$2'
        );
      });
      
      details.responseHeaders['content-security-policy'] = modifiedCSP;
    }
    
    callback({ responseHeaders: details.responseHeaders });
  });
}

/**
 * Process a URL for dark mode application
 * @param {string} url - The URL to process
 * @returns {Object} - Object with shouldApply indicating if dark mode should be applied
 */
function processUrl(url) {
  if (!config.enabled) {
    return { shouldApply: false };
  }
  
  // Check if site is excluded
  if (isExcludedSite(url)) {
    log.debug(`Excluded site: ${url}`);
    config.statistics.sitesSkipped++;
    return { shouldApply: false };
  }
  
  // If auto-detect is enabled, check if site already has dark mode
  if (config.autoDetect && isAlreadyDarkSite(url)) {
    log.debug(`Site already has dark mode: ${url}`);
    config.statistics.sitesSkipped++;
    return { shouldApply: false };
  }
  
  // Apply dark mode
  config.statistics.sitesModified++;
  return { shouldApply: true, css: config.darkModeCSS };
}

/**
 * Enable or disable dark mode
 * @param {boolean} enabled - Whether to enable or disable
 */
function setEnabled(enabled) {
  config.enabled = enabled;
  log.info(`Enhanced Dark Mode ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Add a site to user dark sites list
 * @param {string} site - Site pattern to add
 */
function addUserDarkSite(site) {
  if (!config.userDarkSites.includes(site)) {
    config.userDarkSites.push(site);
    compileRegexes();
    
    // Save list
    try {
      if (config.cacheDir) {
        const userListsFile = path.join(config.cacheDir, 'user-lists.json');
        fs.writeFileSync(userListsFile, JSON.stringify({
          userDarkSites: config.userDarkSites,
          userExcludedSites: config.userExcludedSites
        }));
      } else {
        log.warn('Cannot save user dark sites list: cacheDir not initialized');
      }
    } catch (err) {
      log.error('Error saving user dark sites list:', err);
    }
    
    log.info(`Added ${site} to user dark sites list`);
  }
}

/**
 * Add a site to the excluded sites list
 * @param {string} site - Site to exclude
 */
function addExcludedSite(site) {
  if (!config.userExcludedSites.includes(site)) {
    config.userExcludedSites.push(site);
    
    // Save list
    try {
      if (config.cacheDir) {
        const userListsFile = path.join(config.cacheDir, 'user-lists.json');
        fs.writeFileSync(userListsFile, JSON.stringify({
          userDarkSites: config.userDarkSites,
          userExcludedSites: config.userExcludedSites
        }));
      } else {
        log.warn('Cannot save user excluded sites list: cacheDir not initialized');
      }
    } catch (err) {
      log.error('Error saving user excluded sites list:', err);
    }
    
    log.info(`Added ${site} to excluded sites list`);
  }
}

/**
 * Remove a site from the user dark sites list
 * @param {string} site - Site pattern to remove
 */
function removeUserDarkSite(site) {
  const index = config.userDarkSites.indexOf(site);
  if (index !== -1) {
    config.userDarkSites.splice(index, 1);
    compileRegexes();
    
    // Save list
    try {
      if (config.cacheDir) {
        const userListsFile = path.join(config.cacheDir, 'user-lists.json');
        fs.writeFileSync(userListsFile, JSON.stringify({
          userDarkSites: config.userDarkSites,
          userExcludedSites: config.userExcludedSites
        }));
      } else {
        log.warn('Cannot save user dark sites list: cacheDir not initialized');
      }
    } catch (err) {
      log.error('Error saving user dark sites list:', err);
    }
    
    log.info(`Removed ${site} from user dark sites list`);
  }
}

/**
 * Remove a site from the excluded sites list
 * @param {string} site - Site to remove
 */
function removeExcludedSite(site) {
  const index = config.userExcludedSites.indexOf(site);
  if (index !== -1) {
    config.userExcludedSites.splice(index, 1);
    
    // Save list
    try {
      if (config.cacheDir) {
        const userListsFile = path.join(config.cacheDir, 'user-lists.json');
        fs.writeFileSync(userListsFile, JSON.stringify({
          userDarkSites: config.userDarkSites,
          userExcludedSites: config.userExcludedSites
        }));
      } else {
        log.warn('Cannot save user excluded sites list: cacheDir not initialized');
      }
    } catch (err) {
      log.error('Error saving user excluded sites list:', err);
    }
    
    log.info(`Removed ${site} from excluded sites list`);
  }
}

/**
 * Get current statistics
 * @returns {Object} Statistics object
 */
function getStatistics() {
  return {
    ...config.statistics,
    runTime: Math.floor((Date.now() - config.statistics.startTime) / 1000)
  };
}

/**
 * Ensures the dark mode feature is properly initialized with correct paths
 * Can be called at any time to fix path issues
 * @param {string} userDataPath - Path to the user data directory
 * @param {string} cacheDir - Path to the cache directory
 */
function ensureInitialized(userDataPath, cacheDir) {
  if (!userDataPath) {
    log.error('Cannot initialize dark mode: userDataPath is required');
    return;
  }
  
  // Store user data path for future reference
  config.userDataPath = userDataPath;
  
  // Set cache directory (use provided one or create default)
  config.cacheDir = cacheDir || path.join(userDataPath, 'cache', 'dark-mode');
  
  // Create cache directory if it doesn't exist
  try {
    if (!fs.existsSync(config.cacheDir)) {
      fs.mkdirSync(config.cacheDir, { recursive: true });
      log.info(`Created dark mode cache directory at ${config.cacheDir}`);
    }
    
    // Initialize user settings with defaults
    if (!config.userSettings) {
      config.userSettings = {
        autoDetect: true,
        brightnessReduction: 85,
        contrastEnhancement: 10
      };
    }
    
    // Initialize user site lists if not already defined
    if (!config.userDarkSites) {
      config.userDarkSites = [];
    }
    
    if (!config.userExcludedSites) {
      config.userExcludedSites = [];
    }
    
    log.info('Dark Mode paths and settings ensured');
  } catch (error) {
    log.error('Error ensuring dark mode initialization:', error);
  }
}

/**
 * Validates and sanitizes settings to prevent errors
 * @param {Object} settings - Settings to validate
 * @returns {Object} - Validated settings
 */
function validateSettings(settings) {
  const defaults = {
    autoDetect: true,
    brightnessReduction: 85,
    contrastEnhancement: 10
  };
  
  // Start with defaults
  const validated = {...defaults};
  
  if (settings) {
    // Validate boolean values
    if (typeof settings.autoDetect === 'boolean') {
      validated.autoDetect = settings.autoDetect;
    }
    
    // Validate numeric values with ranges
    if (typeof settings.brightnessReduction === 'number') {
      // Clamp between 40 and 95
      validated.brightnessReduction = Math.max(40, Math.min(95, settings.brightnessReduction));
    }
    
    if (typeof settings.contrastEnhancement === 'number') {
      // Clamp between 0 and 30
      validated.contrastEnhancement = Math.max(0, Math.min(30, settings.contrastEnhancement));
    }
  }
  
  return validated;
}

/**
 * Update dark mode settings
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
  
  // Update user site lists if provided
  if (newSettings && newSettings.userDarkSites !== undefined) {
    config.userDarkSites = newSettings.userDarkSites;
    compileRegexes();
  }
  
  if (newSettings && newSettings.userExcludedSites !== undefined) {
    config.userExcludedSites = newSettings.userExcludedSites;
  }
  
  // Validate and update settings
  const validatedSettings = validateSettings(newSettings);
  
  // Initialize userSettings if needed
  if (!config.userSettings) {
    config.userSettings = validateSettings();
    log.info('Initialized default dark mode settings');
  }
  
  // Update settings object
  Object.assign(config.userSettings, validatedSettings);
  
  // Apply setting values to config
  if (newSettings) {
    if (newSettings.autoDetect !== undefined) {
      config.autoDetect = newSettings.autoDetect;
    }
    
    if (newSettings.brightnessReduction !== undefined) {
      config.brightnessReduction = validatedSettings.brightnessReduction;
      // Regenerate CSS when brightness changes
      config.darkModeCSS = generateDarkModeCSS(config.brightnessReduction, config.contrastEnhancement);
    }
    
    if (newSettings.contrastEnhancement !== undefined) {
      config.contrastEnhancement = validatedSettings.contrastEnhancement;
      // Regenerate CSS when contrast changes
      config.darkModeCSS = generateDarkModeCSS(config.brightnessReduction, config.contrastEnhancement);
    }
  }
  
  log.info('Dark Mode settings updated in memory');
  
  try {
    // Save settings to disk if possible
    if (config.cacheDir) {
      // Ensure directory exists
      fs.mkdirSync(config.cacheDir, { recursive: true });
      
      // Save settings
      const settingsPath = path.join(config.cacheDir, 'settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify(config.userSettings, null, 2));
      
      // Save user site lists
      const userListsFile = path.join(config.cacheDir, 'user-lists.json');
      fs.writeFileSync(userListsFile, JSON.stringify({
        userDarkSites: config.userDarkSites || [],
        userExcludedSites: config.userExcludedSites || []
      }));
      
      log.info('Dark Mode settings and site lists saved to disk');
    } else {
      log.error('Cannot save settings: cacheDir not available');
    }
  } catch (error) {
    log.error('Error saving dark mode settings:', error);
  }
}

module.exports = {
  initialize,
  getPreloadScript,
  processUrl,
  updateSettings,
  setEnabled,
  addUserDarkSite,
  addExcludedSite,
  removeUserDarkSite,
  removeExcludedSite,
  getStatistics,
  ensureInitialized,
  resetToDefaults: () => updateSettings(validateSettings()),
  enabled: config.enabled
};
