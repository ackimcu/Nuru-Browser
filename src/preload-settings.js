/**
 * Nuru Browser Settings Modal Preload Script
 * Exposes safe IPC communication between the settings renderer and main process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose settings API to renderer process
contextBridge.exposeInMainWorld('settingsAPI', {
  // Get settings data
  getSettings: () => ipcRenderer.invoke('get-settings'),
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

  // Password Manager API
  initPasswordManager: () => ipcRenderer.invoke('init-password-manager'),
  setMasterPassword: (password, isNew) => ipcRenderer.invoke('set-master-password', password, isNew),
  lockPasswordManager: () => ipcRenderer.invoke('lock-password-manager'),
  savePassword: (entry) => ipcRenderer.invoke('save-password', entry),
  getPassword: (id) => ipcRenderer.invoke('get-password', id),
  getAllPasswords: () => ipcRenderer.invoke('get-all-passwords'),
  searchPasswords: (query) => ipcRenderer.invoke('search-passwords', query),
  getPasswordsByCategory: (category) => ipcRenderer.invoke('get-passwords-by-category', category),
  getPasswordStats: () => ipcRenderer.invoke('get-password-stats'),
  deletePassword: (id) => ipcRenderer.invoke('delete-password', id),
  generatePassword: (options) => ipcRenderer.invoke('generate-password', options),
  exportPasswords: () => ipcRenderer.invoke('export-passwords'),
  importPasswords: (jsonData) => ipcRenderer.invoke('import-passwords', jsonData),
  forgetPassword: () => ipcRenderer.invoke('forget-password'),
});
