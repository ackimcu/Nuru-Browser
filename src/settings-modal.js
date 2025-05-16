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
 */
function showSettingsModal(mainWindow, settings) {
  // If window already exists, just focus it
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  
  // Set up IPC handlers only once
  if (!ipcHandlersRegistered) {
    setupSettingsHandlers(settings);
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
    settingsWindow.webContents.send('settings-data', {
      browserSettings: settings
    });
  });
}

/**
 * Set up IPC handlers for settings changes
 * @param {Object} settings - Browser settings object
 */
function setupSettingsHandlers(settings) {
  // Remove existing handlers if they exist (to prevent duplicates)
  try {
    ipcMain.removeHandler('save-browser-settings');
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


module.exports = { showSettingsModal };
