/**
 * Nuru Browser Sponsor Skipper
 * A native implementation that skips sponsored segments in videos
 * using the SponsorBlock API (https://sponsor.ajay.app/)
 */

const { net } = require('electron');
const path = require('path');
const fs = require('fs');

// Initialize logging
const log = require('electron-log');
log.transports.file.fileName = 'nuru-sponsor-skipper.log';

// SponsorBlock API configuration
const config = {
  enabled: true,
  apiUrl: 'https://sponsor.ajay.app/api/skipSegments',
  categories: [
    'sponsor',       // Paid sponsorships
    'selfpromo',     // Self promotion
    'interaction',   // Like and subscribe reminders
    'intro',         // Intro animations
    'outro',         // Outro animations
    'preview',       // Preview/recap of content
    'music_offtopic' // Music in non-music sections
  ],
  userSettings: {
    // Default settings per category
    sponsor: { skip: true, notification: true },
    selfpromo: { skip: true, notification: true },
    interaction: { skip: true, notification: true },
    intro: { skip: true, notification: true },
    outro: { skip: true, notification: true },
    preview: { skip: true, notification: true },
    music_offtopic: { skip: false, notification: true }
  },
  cacheDir: null, // Will be set during initialization
  cacheTime: 7 * 24 * 60 * 60 * 1000, // 1 week in ms
  statistics: {
    skipped: {
      total: 0,
      categories: {}
    },
    startTime: Date.now()
  }
};

// In-memory cache of video segments
const segmentCache = new Map();

/**
 * Initialize the sponsor skipper
 * @param {string} userDataPath - Path to the user data directory
 * @param {string} cacheDir - Optional specific cache directory to use
 * @returns {Promise<Object>} - Configuration object
 */
async function initialize(userDataPath, cacheDir) {
  // Store user data path for future reference
  config.userDataPath = userDataPath;
  
  // Set cache directory (use provided one or create default)
  config.cacheDir = cacheDir || path.join(userDataPath, 'sponsor-skipper-cache');
  
  // Create cache directory if it doesn't exist
  if (!fs.existsSync(config.cacheDir)) {
    fs.mkdirSync(config.cacheDir, { recursive: true });
    log.info(`Created sponsor skipper cache directory at ${config.cacheDir}`);
  }
  
  // Initialize user settings with defaults if not already defined
  if (!config.userSettings) {
    config.userSettings = {};
    // Set default settings for each category
    config.categories.forEach(category => {
      config.userSettings[category] = { skip: true, notification: true };
    });
    // Special case for music_offtopic which is off by default
    if (config.userSettings.music_offtopic) {
      config.userSettings.music_offtopic.skip = false;
    }
  }
  
  // Load existing settings if available
  try {
    const settingsPath = path.join(config.cacheDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (savedSettings) {
        Object.assign(config.userSettings, savedSettings);
        log.info('Loaded saved sponsor skipper settings');
      }
    }
  } catch (err) {
    log.error('Error loading sponsor skipper settings:', err);
  }
  
  // Initialize stats for each category
  config.categories.forEach(category => {
    config.statistics.skipped.categories[category] = 0;
  });
  
  // Load any cached segments
  loadCachedSegments();
  
  log.info('Sponsor Skipper initialized with cache dir:', config.cacheDir);
  return config;
}

/**
 * Load cached segments from disk
 */
function loadCachedSegments() {
  try {
    const cacheFile = path.join(config.cacheDir, 'segment-cache.json');
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      
      // Check if the cache has expired entries and filter them out
      const now = Date.now();
      Object.entries(data).forEach(([videoId, entry]) => {
        if (now - entry.timestamp < config.cacheTime) {
          segmentCache.set(videoId, entry);
        }
      });
      
      log.info(`Loaded ${segmentCache.size} cached video segments`);
    }
  } catch (err) {
    log.error('Error loading cached segments:', err);
  }
}

/**
 * Save segment cache to disk
 */
function saveCachedSegments() {
  try {
    const cacheFile = path.join(config.cacheDir, 'segment-cache.json');
    const cacheData = {};
    
    segmentCache.forEach((value, key) => {
      cacheData[key] = value;
    });
    
    fs.writeFileSync(cacheFile, JSON.stringify(cacheData));
    log.debug(`Saved ${segmentCache.size} video segments to cache`);
  } catch (err) {
    log.error('Error saving segment cache:', err);
  }
}

/**
 * Fetch sponsor segments for a specific video
 * @param {string} videoId - The YouTube/video ID
 * @returns {Promise<Array>} - Array of sponsor segments
 */
async function fetchSponsorSegments(videoId) {
  if (!config.enabled) {
    return [];
  }
  
  // Check cache first
  if (segmentCache.has(videoId)) {
    const cachedData = segmentCache.get(videoId);
    const now = Date.now();
    
    // Return cached data if still valid
    if (now - cachedData.timestamp < config.cacheTime) {
      log.debug(`Using cached segments for video ${videoId}`);
      return cachedData.segments;
    }
  }
  
  try {
    // Construct API URL with categories
    const categoryParams = config.categories
      .filter(category => config.userSettings[category].skip || config.userSettings[category].notification)
      .join(',');
      
    const url = `${config.apiUrl}?videoID=${videoId}&categories=${categoryParams}`;
    
    // Fetch segments from API
    const response = await new Promise((resolve, reject) => {
      const request = net.request(url);
      
      let responseData = '';
      
      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });
        
        response.on('end', () => {
          try {
            if (response.statusCode === 200) {
              resolve(JSON.parse(responseData));
            } else {
              reject(new Error(`API returned status ${response.statusCode}`));
            }
          } catch (err) {
            reject(err);
          }
        });
      });
      
      request.on('error', (error) => {
        reject(error);
      });
      
      request.end();
    });
    
    // Process and cache the response
    if (Array.isArray(response)) {
      const segments = response.map(segment => ({
        category: segment.category,
        start: segment.segment[0],
        end: segment.segment[1],
        uuid: segment.UUID
      }));
      
      // Cache the segments
      segmentCache.set(videoId, {
        segments,
        timestamp: Date.now()
      });
      
      // Save cache periodically (simple implementation)
      // In a more robust version, we'd use debouncing or scheduled saving
      setTimeout(saveCachedSegments, 5000);
      
      log.info(`Fetched ${segments.length} segments for video ${videoId}`);
      return segments;
    }
    
    return [];
  } catch (err) {
    log.error(`Error fetching sponsor segments for ${videoId}:`, err);
    return [];
  }
}

/**
 * Get the preload script content for sponsor skipping
 * This will be injected into webviews
 * @returns {string} - JavaScript code as a string
 */
function getPreloadScript() {
  return `
    // SponsorBlock integration for Nuru Browser
    (function() {
      // Track processed videos to avoid duplicate work
      // Function to handle video path changes on YouTube
      function detectVideoChange() {
        const url = window.location.href;
        const videoId = getYouTubeVideoId(url);
        
        if (videoId && videoId !== currentVideoId) {
          currentVideoId = videoId;
          
          if (!processedVideos.has(videoId)) {
            processedVideos.add(videoId);
            
            // Notify main process about the new video
            window.postMessage({ type: 'sponsor-video-detected', videoId }, '*');
            
            // Find video element (this is YouTube-specific)
            findVideoElement();
          }
        }
      }
      
      // Find the main video element
      function findVideoElement() {
        // For YouTube
        if (window.location.hostname.includes('youtube.com')) {
          videoElement = document.querySelector('video');
          
          if (videoElement) {
            setupVideoListeners();
          } else {
            // If not found immediately, try again soon
            setTimeout(findVideoElement, 500);
          }
        }
      }
      
      // Set up video event listeners
      function setupVideoListeners() {
        if (!videoElement) return;
        
        // Remove any existing listeners first
        videoElement.removeEventListener('timeupdate', checkForSponsorSegment);
        
        // Add time update listener
        videoElement.addEventListener('timeupdate', checkForSponsorSegment);
      }
      
      // Check if current time is in a sponsor segment
      function checkForSponsorSegment() {
        if (!videoElement || !segments.length) return;
        
        const currentTime = videoElement.currentTime;
        
        for (const segment of segments) {
          // If we're in a segment and the category is set to skip
          if (currentTime >= segment.start && 
              currentTime < segment.end && 
              window.nurubrowser_sponsorSkipperSettings[segment.category].skip) {
            
            // Skip to the end of the segment
            videoElement.currentTime = segment.end;
            
            // Show notification if enabled
            if (window.nurubrowser_sponsorSkipperSettings[segment.category].notification) {
              showSkipNotification(segment);
            }
            
            // Send skip event to main process for statistics
            window.postMessage({ 
              type: 'sponsor-segment-skipped',
              category: segment.category,
              duration: segment.end - segment.start
            }, '*');
            
            // Break after skipping one segment
            break;
          }
        }
      }
      
      // Show a notification when a segment is skipped
      function showSkipNotification(segment) {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('nuru-sponsor-notification');
        if (!notification) {
          notification = document.createElement('div');
          notification.id = 'nuru-sponsor-notification';
          notification.style.cssText = \`
            position: fixed;
            bottom: 70px;
            right: 20px;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 9999;
            font-family: Arial, sans-serif;
            font-size: 14px;
            transition: opacity 0.3s ease;
            opacity: 0;
          \`;
          document.body.appendChild(notification);
        }
        
        // Set notification text based on category
        let categoryText = segment.category;
        switch (segment.category) {
          case 'sponsor': categoryText = 'Sponsor'; break;
          case 'selfpromo': categoryText = 'Self Promotion'; break;
          case 'interaction': categoryText = 'Interaction Reminder'; break;
          case 'intro': categoryText = 'Intro'; break;
          case 'outro': categoryText = 'Outro'; break;
          case 'preview': categoryText = 'Preview/Recap'; break;
          case 'music_offtopic': categoryText = 'Non-Music Section'; break;
        }
        
        notification.textContent = \`Skipped: \${categoryText}\`;
        
        // Display notification
        notification.style.opacity = '1';
        
        // Hide after 3 seconds
        setTimeout(() => {
          notification.style.opacity = '0';
        }, 3000);
      }
      
      // Handle segments when they arrive
      function handleSegments() {
        if (videoElement && segments.length) {
          // Check immediately in case we're already in a segment
          checkForSponsorSegment();
        }
      }
      
      // Initial settings object, will be updated from main process
      window.nurubrowser_sponsorSkipperSettings = {
        sponsor: { skip: true, notification: true },
        selfpromo: { skip: true, notification: true },
        interaction: { skip: true, notification: true },
        intro: { skip: true, notification: true },
        outro: { skip: true, notification: true },
        preview: { skip: true, notification: true },
        music_offtopic: { skip: false, notification: true }
      };
      
      // Start monitoring for video changes on YouTube
      if (window.location.hostname.includes('youtube.com')) {
        // Detect initial video
        detectVideoChange();
        
        // Set up navigation observer for YouTube's SPA
        observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'childList' || mutation.type === 'attributes') {
              detectVideoChange();
              break;
            }
          }
        });
        
        // Start observing document for URL/content changes
        observer.observe(document, { 
          childList: true, 
          subtree: true,
          attributes: true,
          attributeFilter: ['src', 'href']
        });
      }
      
      // Expose functions for possible use by main process
      window.nurubrowser_sponsorSkipper = {
        updateSettings: (newSettings) => {
          window.nurubrowser_sponsorSkipperSettings = newSettings;
        }
      };
    })();
  `;
}

/**
 * Ensures the sponsor skipper is properly initialized with correct paths
 * Can be called at any time to fix path issues
 * @param {string} userDataPath - Path to the user data directory
 * @param {string} cacheDir - Path to the cache directory
 */
function ensureInitialized(userDataPath, cacheDir) {
  if (!userDataPath) {
    log.error('Cannot initialize sponsor skipper: userDataPath is required');
    return;
  }
  
  // Store user data path for future reference
  config.userDataPath = userDataPath;
  
  // Set cache directory (use provided one or create default)
  config.cacheDir = cacheDir || path.join(userDataPath, 'cache', 'sponsors');
  
  // Create cache directory if it doesn't exist
  try {
    if (!fs.existsSync(config.cacheDir)) {
      fs.mkdirSync(config.cacheDir, { recursive: true });
      log.info(`Created sponsor skipper cache directory at ${config.cacheDir}`);
    }
    
    // Initialize user settings if not already defined
    if (!config.userSettings) {
      config.userSettings = {};
      // Set default settings for each category
      config.categories.forEach(category => {
        config.userSettings[category] = { skip: true, notification: true };
      });
      // Special case for music_offtopic which is off by default
      if (config.userSettings.music_offtopic) {
        config.userSettings.music_offtopic.skip = false;
      }
    }
    
    log.info('Sponsor Skipper paths and settings ensured');
  } catch (error) {
    log.error('Error ensuring sponsor skipper initialization:', error);
  }
}

/**
 * Validates and sanitizes settings to prevent errors
 * @param {Object} settings - Settings to validate
 * @returns {Object} - Validated settings
 */
function validateSettings(settings) {
  // Start with default settings
  const validated = {};
  
  // Set default settings for each category
  config.categories.forEach(category => {
    validated[category] = { skip: true, notification: true };
  });
  
  // Special case for music_offtopic which is off by default
  if (validated.music_offtopic) {
    validated.music_offtopic.skip = false;
  }
  
  if (settings) {
    // Apply user settings, ensuring proper types
    config.categories.forEach(category => {
      if (settings[category]) {
        if (typeof settings[category].skip === 'boolean') {
          validated[category].skip = settings[category].skip;
        }
        if (typeof settings[category].notification === 'boolean') {
          validated[category].notification = settings[category].notification;
        }
      }
    });
  }
  
  return validated;
}

/**
 * Update user settings for sponsor skipping
 * @param {Object} newSettings - New user settings
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
    config.userSettings = validateSettings();
  }
  
  // Update with validated settings
  Object.assign(config.userSettings, validatedSettings);
  log.info('Sponsor Skipper settings updated in memory');
  
  try {
    // Ensure cache directory exists
    if (config.cacheDir) {
      fs.mkdirSync(config.cacheDir, { recursive: true });
      
      // Save settings to file
      const settingsPath = path.join(config.cacheDir, 'settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify(config.userSettings, null, 2));
      log.info('Sponsor Skipper settings saved to disk:', settingsPath);
    } else {
      log.error('Cannot save settings: cacheDir not available');
    }
  } catch (error) {
    log.error('Error saving sponsor skipper settings:', error);
  }
}

/**
 * Enable or disable the sponsor skipper
 * @param {boolean} enabled - Whether to enable or disable
 */
function setEnabled(enabled) {
  config.enabled = enabled;
  log.info(`Sponsor Skipper ${enabled ? 'enabled' : 'disabled'}`);
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
 * Handle a skipped segment for statistics
 * @param {string} category - Category of the skipped segment
 */
function recordSkippedSegment(category) {
  config.statistics.skipped.total++;
  
  if (config.statistics.skipped.categories[category] !== undefined) {
    config.statistics.skipped.categories[category]++;
  }
}

/**
 * Clear the segment cache
 */
function clearCache() {
  segmentCache.clear();
  
  try {
    const cacheFile = path.join(config.cacheDir, 'segment-cache.json');
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }
    log.info('Sponsor segment cache cleared');
  } catch (err) {
    log.error('Error clearing segment cache:', err);
  }
}

module.exports = {
  initialize,
  fetchSponsorSegments,
  getPreloadScript,
  updateSettings,
  setEnabled,
  getStatistics,
  recordSkippedSegment,
  clearCache,
  ensureInitialized,
  resetToDefaults: () => updateSettings(validateSettings()),
  enabled: config.enabled
};
