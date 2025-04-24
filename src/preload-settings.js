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
  
  // Ad Blocker
  toggleAdBlocker: (enabled) => {
    return ipcRenderer.invoke('toggle-ad-blocker', enabled);
  },
  addAdBlockerFilter: (filter) => {
    return ipcRenderer.invoke('add-ad-blocker-filter', filter);
  },
  removeAdBlockerFilter: (filterId) => {
    return ipcRenderer.invoke('remove-ad-blocker-filter', filterId);
  },
  
  // Sponsor Skipper
  toggleSponsorSkipper: (enabled) => {
    return ipcRenderer.invoke('toggle-sponsor-skipper', enabled);
  },
  updateSponsorSkipperSettings: (settings) => {
    return ipcRenderer.invoke('update-sponsor-skipper-settings', settings);
  },
  
  // Dark Mode
  toggleDarkMode: (enabled) => {
    return ipcRenderer.invoke('toggle-dark-mode', enabled);
  },
  updateDarkModeSettings: (settings) => {
    return ipcRenderer.invoke('update-dark-mode-settings', settings);
  },
  
  // Zoom Level
  updateZoomLevel: (zoomLevel) => {
    return ipcRenderer.invoke('update-zoom-level', zoomLevel);
  },
  
  // UI Controls
  closeSettings: () => {
    ipcRenderer.send('close-settings');
  }
});
