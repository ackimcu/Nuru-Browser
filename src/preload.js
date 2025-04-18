const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
// Set up event listener for webview message relay
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'link-clicked' && event.data.url) {
    ipcRenderer.send('link-clicked', event.data.url);
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings API
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  updateZoom: (zoomFactor) => ipcRenderer.invoke('update-zoom', zoomFactor),
  
  // Window controls
  toggleFrameless: () => ipcRenderer.invoke('toggle-frameless'),
  toggleDarkMode: () => ipcRenderer.invoke('toggle-dark-mode'),
  toggleDevelopmentMode: async () => {
    return await ipcRenderer.invoke('toggle-development-mode');
  },
  
  // Diagnostics and logging
  showDiagnostics: () => ipcRenderer.send('show-diagnostics'),
  checkWebGL: () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    ipcRenderer.send('webgl-status', !!gl);
    return !!gl;
  },
  
  // Error handling
  logMessage: (level, message) => ipcRenderer.send('log-message', { level, message }),
  
  // App control
  closeApp: () => ipcRenderer.send('close-app'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  
  // Search functionality
  saveSearchEngine: (engine) => ipcRenderer.invoke('save-search-engine', engine),
  getSearchEngine: () => ipcRenderer.invoke('get-search-engine'),
  getDNSPredictions: (url) => ipcRenderer.invoke('get-dns-predictions', url),
  
  // IPC listeners
  onDarkModeChanged: (callback) => {
    ipcRenderer.on('dark-mode-changed', (_, darkMode) => callback(darkMode));
  },
  onShowError: (callback) => {
    ipcRenderer.on('show-error', (_, errorData) => callback(errorData));
  },
  onSettingsUpdated: (callback) => {
    ipcRenderer.on('settings-updated', (_, setting) => callback(setting));
  },
  onCheckWebGL: (callback) => {
    ipcRenderer.on('check-webgl', () => callback());
  },
  
  // Update notifications
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_, status, data) => callback(status, data));
  },
  
  // Development mode
  onDevelopmentModeChanged: (callback) => {
    ipcRenderer.on('development-mode-changed', (_, isDevMode) => callback(isDevMode));
  },
  
  // Tab management
  relayLinkClicked: (url) => ipcRenderer.send('link-clicked', url),
  onLinkClicked: (callback) => {
    ipcRenderer.on('link-clicked', (_, url) => callback(url));
  }
});
