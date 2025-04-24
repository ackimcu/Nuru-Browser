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
  setDarkMode: (enabled) => ipcRenderer.invoke('set-dark-mode', enabled),
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
  showSettings: () => ipcRenderer.send('show-settings'),
  
  // Search functionality
  saveSearchEngine: (engine) => ipcRenderer.invoke('save-search-engine', engine),
  getSearchEngine: () => ipcRenderer.invoke('get-search-engine'),
  getDNSPredictions: (url) => ipcRenderer.invoke('get-dns-predictions', url),
  
  // Native Features - Ad Blocker
  getAdBlockerConfig: () => ipcRenderer.invoke('ad-blocker:get-config'),
  getAdBlockerStats: () => ipcRenderer.invoke('ad-blocker:get-stats'),
  setAdBlockerEnabled: (enabled) => ipcRenderer.invoke('ad-blocker:set-enabled', enabled),
  forceUpdateAdBlocker: () => ipcRenderer.invoke('ad-blocker:force-update'),
  
  // Native Features - Sponsor Skipper
  getSponsorSkipperConfig: () => ipcRenderer.invoke('sponsor-skipper:get-config'),
  getSponsorSkipperStats: () => ipcRenderer.invoke('sponsor-skipper:get-stats'),
  setSponsorSkipperEnabled: (enabled) => ipcRenderer.invoke('sponsor-skipper:set-enabled', enabled),
  updateSponsorSkipperSettings: (settings) => ipcRenderer.invoke('sponsor-skipper:update-settings', settings),
  clearSponsorSkipperCache: () => ipcRenderer.invoke('sponsor-skipper:clear-cache'),
  
  // Native Features - Enhanced Dark Mode
  getDarkModeConfig: () => ipcRenderer.invoke('dark-mode:get-config'),
  getDarkModeStats: () => ipcRenderer.invoke('dark-mode:get-stats'),
  setDarkModeEnabled: (enabled) => ipcRenderer.invoke('dark-mode:set-enabled', enabled),
  updateDarkModeSettings: (settings) => ipcRenderer.invoke('dark-mode:update-settings', settings),
  addDarkSite: (site) => ipcRenderer.invoke('dark-mode:add-dark-site', site),
  addExcludedSite: (site) => ipcRenderer.invoke('dark-mode:add-excluded-site', site),
  removeDarkSite: (site) => ipcRenderer.invoke('dark-mode:remove-dark-site', site),
  removeExcludedSite: (site) => ipcRenderer.invoke('dark-mode:remove-excluded-site', site),
  
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
  
  // Native Features events
  onFeatureStatusChanged: (callback) => {
    ipcRenderer.on('feature-status-changed', (_, featureId, status) => callback(featureId, status));
  },
  onAdBlockerStats: (callback) => {
    ipcRenderer.on('ad-blocker-stats', (_, stats) => callback(stats));
  },
  onSponsorSegmentsUpdated: (callback) => {
    ipcRenderer.on('sponsor-segments-updated', (_, data) => callback(data));
  },
  onDarkModeSettingsChanged: (callback) => {
    ipcRenderer.on('dark-mode-settings-changed', (_, settings) => callback(settings));
  },
  
  // Tab management
  relayLinkClicked: (url) => ipcRenderer.send('link-clicked', url),
  onLinkClicked: (callback) => {
    ipcRenderer.on('link-clicked', (_, url) => callback(url));
  },
  onFullscreenChanged: (callback) => {
    ipcRenderer.on('fullscreen-changed', (_, isFullscreen) => callback(isFullscreen));
  }
});
