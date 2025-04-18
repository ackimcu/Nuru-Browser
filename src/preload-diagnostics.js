const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');

// Expose protected methods for the diagnostics window
contextBridge.exposeInMainWorld('diagnosticsAPI', {
  // App info
  getAppInfo: async () => {
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timed out')), 5000)
      );
      
      const resultPromise = ipcRenderer.invoke('get-app-info');
      return await Promise.race([resultPromise, timeoutPromise]);
    } catch (error) {
      console.error('Error in getAppInfo:', error);
      throw error;
    }
  },
  
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  
  // Log handling
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  readLogFile: async () => {
    try {
      const logPath = await ipcRenderer.invoke('get-log-path');
      
      // Read the log file if it exists
      if (fs.existsSync(logPath)) {
        const data = fs.readFileSync(logPath, 'utf8');
        
        // Get the last 300 lines
        const lines = data.split('\n');
        return lines.slice(Math.max(0, lines.length - 300)).join('\n');
      }
      return 'No logs found.';
    } catch (error) {
      return `Error reading log file: ${error.message}`;
    }
  },
  
  // WebGL status
  checkWebGL: () => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!gl;
    } catch (error) {
      console.error('Error checking WebGL:', error);
      return false;
    }
  }
});
