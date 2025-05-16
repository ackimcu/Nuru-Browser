/**
 * Nuru Browser Settings Modal Preload Script
 * Exposes safe IPC communication between the settings renderer and main process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose settings API to renderer process
contextBridge.exposeInMainWorld('settingsAPI', {
  // Get settings data
  onSettingsDataReceived: (callback) => {
    ipcRenderer.on('settings-data', (_, data) => callback(data));
  },
  
  // Save browser settings
  saveBrowserSettings: (settings) => {
    return ipcRenderer.invoke('save-browser-settings', settings);
  },
  
  // Save all settings at once
  saveAllSettings: (settings) => {
    return ipcRenderer.invoke('save-all-settings', settings);
  },
  
  // UI Controls
  closeSettings: () => {
    ipcRenderer.send('close-settings');
  },
  
  // Zoom Level
  updateZoomLevel: (zoomLevel) => {
    return ipcRenderer.invoke('update-zoom-level', zoomLevel);
  },
  
  // Clear cache
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  // Delete all user data
  deleteAllUserData: () => ipcRenderer.invoke('delete-all-user-data'),
  // Restart the application
  restartApp: () => ipcRenderer.invoke('restart-app'),
});
