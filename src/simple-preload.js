// Ultra simple preload script with minimal dependencies
const { contextBridge, ipcRenderer } = require('electron');

// Log that this script is running
console.log('Ultra simple preload script starting...');

// Expose minimal API to the renderer process
contextBridge.exposeInMainWorld('diagnosticsAPI', {
  // Get app information via IPC
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  // Update functionality
  checkForUpdates: () => {
    console.log('Requesting update check from preload script');
    return ipcRenderer.invoke('check-for-updates-simple');
  },
  
  // Update actions
  downloadUpdate: () => {
    console.log('Requesting update download from preload script');
    return ipcRenderer.invoke('download-update');
  },
  
  installUpdate: () => {
    console.log('Requesting update installation from preload script');
    return ipcRenderer.invoke('install-update');
  },
  
  // Check WebGL
  checkWebGL: () => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return { available: !!gl, info: gl ? 'WebGL Available' : 'WebGL Not Available' };
    } catch (e) {
      return { available: false, info: 'WebGL check failed: ' + e.message };
    }
  },
  
  // Get logs
  getLogs: () => ipcRenderer.invoke('get-log-content')
});

// Expose settings API to diagnostics window for theme support
contextBridge.exposeInMainWorld('settingsAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings')
});

// Listen for update events from the main process
ipcRenderer.on('update-available', (event, updateInfo) => {
  console.log('Update available event received:', updateInfo);
  document.dispatchEvent(new CustomEvent('update-available', { detail: updateInfo }));
});

ipcRenderer.on('update-download-progress', (event, progressInfo) => {
  console.log('Update download progress:', progressInfo.percent);
  document.dispatchEvent(new CustomEvent('update-download-progress', { detail: progressInfo }));
});

ipcRenderer.on('update-downloaded', () => {
  console.log('Update downloaded event received');
  document.dispatchEvent(new CustomEvent('update-downloaded'));
});

console.log('Ultra simple preload script initialized successfully');
