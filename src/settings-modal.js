/**
 * Nuru Browser Settings Modal
 * A modal dialog for controlling browser settings and native features
 */

const { BrowserWindow, ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

// Settings window reference
let settingsWindow = null;

// Flag to track if IPC handlers are already set up
let ipcHandlersRegistered = false;

/**
 * Create and display the settings modal window
 * @param {Object} mainWindow - The main browser window
 * @param {Object} settings - Current browser settings
 * @param {Object} features - Browser features module (if available)
 */
function showSettingsModal(mainWindow, settings, features) {
  // If window already exists, just focus it
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  
  // Set up IPC handlers only once
  if (!ipcHandlersRegistered) {
    setupSettingsHandlers(settings, features);
    ipcHandlersRegistered = true;
  }

  const parentBounds = mainWindow.getBounds();
  const width = 600;
  const height = 700;

  // Create settings window
  settingsWindow = new BrowserWindow({
    width: width,
    height: height,
    x: Math.floor(parentBounds.x + (parentBounds.width - width) / 2),
    y: Math.floor(parentBounds.y + (parentBounds.height - height) / 2),
    parent: mainWindow,
    modal: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#272727',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-settings.js')
    }
  });

  // Load settings HTML file
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

  // Handle window close
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  // When the window is ready, send the settings
  settingsWindow.webContents.on('did-finish-load', () => {
    const featuresConfig = features ? {
      adBlocker: features.adBlocker ? {
        enabled: features.adBlocker.enabled || false,
        customFilters: getAdBlockerCustomFilters(),
        statistics: features.adBlocker.getStatistics ? features.adBlocker.getStatistics() : null
      } : null,
      sponsorSkipper: features.sponsorSkipper ? {
        enabled: features.sponsorSkipper.enabled || false,
        categories: (features.config && features.config.sponsorSkipper) ? features.config.sponsorSkipper.userSettings : null,
        statistics: features.sponsorSkipper.getStatistics ? features.sponsorSkipper.getStatistics() : null
      } : null,
      darkMode: features.darkMode ? {
        enabled: features.darkMode.enabled || false,
        autoDetect: (features.config && features.config.darkMode) ? features.config.darkMode.autoDetect : true,
        brightnessReduction: (features.config && features.config.darkMode) ? features.config.darkMode.brightnessReduction : 85,
        contrastEnhancement: (features.config && features.config.darkMode) ? features.config.darkMode.contrastEnhancement : 10,
        statistics: features.darkMode.getStatistics ? features.darkMode.getStatistics() : null
      } : null
    } : null;

    settingsWindow.webContents.send('settings-data', {
      browserSettings: settings,
      featuresConfig: featuresConfig
    });
  });
}

/**
 * Set up IPC handlers for settings changes
 * @param {Object} settings - Browser settings object
 * @param {Object} features - Browser features module
 */
function setupSettingsHandlers(settings, features) {
  // Remove existing handlers if they exist (to prevent duplicates)
  try {
    ipcMain.removeHandler('save-browser-settings');
    ipcMain.removeHandler('toggle-ad-blocker');
    ipcMain.removeHandler('add-ad-blocker-filter');
    ipcMain.removeHandler('remove-ad-blocker-filter');
    ipcMain.removeHandler('toggle-sponsor-skipper');
    ipcMain.removeHandler('update-sponsor-skipper-settings');
    ipcMain.removeHandler('toggle-dark-mode');
    ipcMain.removeHandler('update-dark-mode-settings');
    ipcMain.removeHandler('update-zoom-level');
  } catch (err) {
    // Ignore errors if handlers don't exist
  }
  // Save browser settings
  ipcMain.handle('save-browser-settings', (event, newSettings) => {
    try {
      // Apply settings
      Object.assign(settings, newSettings);
      
      // Save the settings to disk
      const settingsPath = path.join(app.getPath('userData'), 'nuru_browser_settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      
      log.info('Browser settings saved');
      return { success: true };
    } catch (err) {
      log.error('Error saving browser settings:', err);
      return { success: false, error: err.message };
    }
  });

  // Toggle ad blocker
  ipcMain.handle('toggle-ad-blocker', (event, enabled) => {
    try {
      if (features && features.adBlocker) {
        features.adBlocker.setEnabled(enabled);
        
        if (settings.features) {
          settings.features.adBlocker.enabled = enabled;
          saveSettings(settings);
        }
        
        log.info(`Ad blocker ${enabled ? 'enabled' : 'disabled'}`);
        return { success: true };
      }
      return { success: false, error: 'Ad blocker not available' };
    } catch (err) {
      log.error('Error toggling ad blocker:', err);
      return { success: false, error: err.message };
    }
  });

  // Add ad blocker filter
  ipcMain.handle('add-ad-blocker-filter', (event, filter) => {
    try {
      const filtersDir = path.join(app.getPath('userData'), 'ad-blocker-filters');
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(filtersDir)) {
        fs.mkdirSync(filtersDir, { recursive: true });
      }
      
      // Generate a unique filename based on the filter content
      const filename = `custom-${Date.now()}.txt`;
      const filterPath = path.join(filtersDir, filename);
      
      // Save the filter
      fs.writeFileSync(filterPath, filter.content || '');
      
      // Store metadata
      const metadataPath = path.join(filtersDir, 'metadata.json');
      let metadata = [];
      
      if (fs.existsSync(metadataPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        } catch (e) {
          log.error('Error parsing ad blocker filter metadata:', e);
        }
      }
      
      metadata.push({
        id: filename,
        name: filter.name || 'Custom Filter',
        description: filter.description || '',
        created: new Date().toISOString(),
        enabled: true
      });
      
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      // Force update of ad blocker if it's available
      if (features && features.adBlocker && features.adBlocker.forceUpdate) {
        features.adBlocker.forceUpdate();
      }
      
      log.info('Added custom ad blocker filter');
      return { success: true, filters: getAdBlockerCustomFilters() };
    } catch (err) {
      log.error('Error adding ad blocker filter:', err);
      return { success: false, error: err.message };
    }
  });

  // Remove ad blocker filter
  ipcMain.handle('remove-ad-blocker-filter', (event, filterId) => {
    try {
      const filtersDir = path.join(app.getPath('userData'), 'ad-blocker-filters');
      const metadataPath = path.join(filtersDir, 'metadata.json');
      
      if (!fs.existsSync(metadataPath)) {
        return { success: false, error: 'No custom filters found' };
      }
      
      // Load metadata
      let metadata = [];
      try {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      } catch (e) {
        log.error('Error parsing ad blocker filter metadata:', e);
        return { success: false, error: 'Error parsing filter data' };
      }
      
      // Find the filter
      const filterIndex = metadata.findIndex(f => f.id === filterId);
      if (filterIndex === -1) {
        return { success: false, error: 'Filter not found' };
      }
      
      // Remove the filter file
      const filterPath = path.join(filtersDir, filterId);
      if (fs.existsSync(filterPath)) {
        fs.unlinkSync(filterPath);
      }
      
      // Update metadata
      metadata.splice(filterIndex, 1);
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      // Force update of ad blocker if it's available
      if (features && features.adBlocker && features.adBlocker.forceUpdate) {
        features.adBlocker.forceUpdate();
      }
      
      log.info(`Removed ad blocker filter: ${filterId}`);
      return { success: true, filters: getAdBlockerCustomFilters() };
    } catch (err) {
      log.error('Error removing ad blocker filter:', err);
      return { success: false, error: err.message };
    }
  });

  // Toggle sponsor skipper
  ipcMain.handle('toggle-sponsor-skipper', (event, enabled) => {
    try {
      if (features && features.sponsorSkipper) {
        features.sponsorSkipper.setEnabled(enabled);
        
        if (settings.features) {
          settings.features.sponsorSkipper.enabled = enabled;
          saveSettings(settings);
        }
        
        log.info(`Sponsor skipper ${enabled ? 'enabled' : 'disabled'}`);
        return { success: true };
      }
      return { success: false, error: 'Sponsor skipper not available' };
    } catch (err) {
      log.error('Error toggling sponsor skipper:', err);
      return { success: false, error: err.message };
    }
  });

  // Update sponsor skipper settings
  ipcMain.handle('update-sponsor-skipper-settings', (event, categorySettings) => {
    try {
      if (features && features.sponsorSkipper) {
        features.sponsorSkipper.updateSettings(categorySettings);
        
        if (settings.features) {
          settings.features.sponsorSkipper.categories = categorySettings;
          saveSettings(settings);
        }
        
        log.info('Sponsor skipper settings updated');
        return { success: true };
      }
      return { success: false, error: 'Sponsor skipper not available' };
    } catch (err) {
      log.error('Error updating sponsor skipper settings:', err);
      return { success: false, error: err.message };
    }
  });

  // Toggle dark mode
  ipcMain.handle('toggle-dark-mode', (event, enabled) => {
    try {
      if (features && features.darkMode) {
        features.darkMode.setEnabled(enabled);
        
        // Also update the main browser setting
        settings.dark_mode = enabled;
        
        if (settings.features) {
          settings.features.darkMode.enabled = enabled;
          saveSettings(settings);
        }
        
        log.info(`Dark mode ${enabled ? 'enabled' : 'disabled'}`);
        return { success: true };
      }
      return { success: false, error: 'Dark mode not available' };
    } catch (err) {
      log.error('Error toggling dark mode:', err);
      return { success: false, error: err.message };
    }
  });

  // Update dark mode settings
  ipcMain.handle('update-dark-mode-settings', (event, newSettings) => {
    try {
      if (features && features.darkMode) {
        features.darkMode.updateSettings(newSettings);
        
        if (settings.features) {
          Object.assign(settings.features.darkMode, newSettings);
          saveSettings(settings);
        }
        
        log.info('Dark mode settings updated');
        return { success: true };
      }
      return { success: false, error: 'Dark mode not available' };
    } catch (err) {
      log.error('Error updating dark mode settings:', err);
      return { success: false, error: err.message };
    }
  });

  // Update zoom level
  ipcMain.handle('update-zoom-level', (event, zoomLevel) => {
    try {
      settings.zoom_factor = zoomLevel;
      saveSettings(settings);
      
      log.info(`Zoom level updated to ${zoomLevel}`);
      return { success: true };
    } catch (err) {
      log.error('Error updating zoom level:', err);
      return { success: false, error: err.message };
    }
  });

  // Close settings window
  ipcMain.on('close-settings', () => {
    if (settingsWindow) {
      settingsWindow.close();
    }
  });
}

/**
 * Save settings to disk
 * @param {Object} settings - Settings object to save
 */
function saveSettings(settings) {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'nuru_browser_settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    log.info('Settings saved');
  } catch (err) {
    log.error('Error saving settings:', err);
  }
}

/**
 * Get custom ad blocker filters
 * @returns {Array} List of custom filters
 */
function getAdBlockerCustomFilters() {
  try {
    const filtersDir = path.join(app.getPath('userData'), 'ad-blocker-filters');
    const metadataPath = path.join(filtersDir, 'metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
      return [];
    }
    
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (err) {
    log.error('Error getting ad blocker custom filters:', err);
    return [];
  }
}

module.exports = { showSettingsModal };
