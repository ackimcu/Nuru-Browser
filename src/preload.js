console.log(`Electron version: ${process.versions.electron}, Chrome version: ${process.versions.chrome}`);

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
  onShowSettings: (callback) => ipcRenderer.on('show-settings', callback),
  onShowSettingsViewport: (callback) => ipcRenderer.on('show-settings-viewport', callback),
  
  // Search functionality
  saveSearchEngine: (engine) => ipcRenderer.invoke('save-search-engine', engine),
  getSearchEngine: () => ipcRenderer.invoke('get-search-engine'),
  getDNSPredictions: (url) => ipcRenderer.invoke('get-dns-predictions', url),
  
  // Start page functionality
  navigateToUrl: (url) => ipcRenderer.invoke('navigate-to-url', url),
  openNewTab: (url) => ipcRenderer.invoke('open-new-tab', url),
  showDownloads: () => ipcRenderer.invoke('show-downloads'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  
  // Event listeners for start page
  onNavigateToUrl: (callback) => ipcRenderer.on('navigate-to-url', callback),
  onOpenNewTab: (callback) => ipcRenderer.on('open-new-tab', callback),
  onShowDownloads: (callback) => ipcRenderer.on('show-downloads', callback),
  
  // IPC listeners
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
  
  // Tab management
  relayLinkClicked: (url) => ipcRenderer.send('link-clicked', url),
  onLinkClicked: (callback) => {
    ipcRenderer.on('link-clicked', (_, url) => callback(url));
  },
  onFullscreenChanged: (callback) => {
    ipcRenderer.on('fullscreen-changed', (_, isFullscreen) => callback(isFullscreen));
  },
  
  // Notify renderer when an ad domain is blocked
  onAdblockBlocked: (callback) => ipcRenderer.on('adblock-blocked', (_, host) => callback(host)),
  
  // Context menu: new tab command
  onContextMenuNewTab: (callback) => ipcRenderer.on('context-menu-new-tab', (_, url) => callback(url)),
  
  // Password manager context menu commands
  onOpenPasswordManager: (callback) => ipcRenderer.on('open-password-manager', () => callback()),
  onAddPassword: (callback) => ipcRenderer.on('add-password', () => callback()),
  onGeneratePassword: (callback) => ipcRenderer.on('generate-password', () => callback()),
  
  
  // Download events
  onDownloadStart: (callback) => ipcRenderer.on('download-start', (_, data) => callback(data)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, data) => callback(data)),
  onDownloadDone: (callback) => ipcRenderer.on('download-done', (_, data) => callback(data)),
  cancelDownload: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId),
  
  // Notify renderer when an ad domain is blocked
  onFullscreenChanged: (callback) => {
    ipcRenderer.on('fullscreen-changed', (_, isFullscreen) => callback(isFullscreen));
  },
  toggleDownloadHistoryCard: () => ipcRenderer.invoke('toggle-download-history-card'),
  getDownloadHistory: () => ipcRenderer.invoke('get-download-history'),
  clearDownloadHistory: () => ipcRenderer.invoke('clear-download-history'),
  onShowDownloadHistoryCard: (callback) => ipcRenderer.on('show-download-history-card', (_, data) => callback(data)),
  onHideDownloadHistoryCard: (callback) => ipcRenderer.on('hide-download-history-card', () => callback()),
  onDownloadHistoryUpdated: (callback) => ipcRenderer.on('download-history-updated', (_, data) => callback(data)),

  // Autofill API
  getPasswordSuggestions: (domain) => ipcRenderer.invoke('get-password-suggestions', domain),
  savePasswordFromForm: (entry) => ipcRenderer.invoke('save-password-from-form', entry),
  injectAutofillScript: (webviewId) => ipcRenderer.invoke('inject-autofill-script', webviewId),
  
  // Welcome page API
  closeWelcome: () => ipcRenderer.send('close-welcome'),
  checkWelcomeCompleted: () => ipcRenderer.invoke('check-welcome-completed'),
  saveAllSettings: (settings) => ipcRenderer.invoke('save-all-settings', settings),
  resetWelcome: () => ipcRenderer.invoke('reset-welcome'),
});
