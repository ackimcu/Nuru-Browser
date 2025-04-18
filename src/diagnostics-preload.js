// Simple diagnostics preload script - brand new implementation
const { contextBridge, ipcRenderer } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Log preload script initiation
console.log('Simple diagnostics preload starting...');

// Define a VERY simple API that we know will work
contextBridge.exposeInMainWorld('diagnosticsAPI', {
  // Basic system info that doesn't rely on IPC
  getBasicInfo: () => {
    console.log('Getting basic system info directly');
    return {
      success: true,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      cpuCores: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10, // GB
      freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024) * 10) / 10, // GB
      uptime: Math.floor(os.uptime() / 60), // minutes
      hostname: os.hostname(),
      osType: os.type(),
      osRelease: os.release()
    };
  },
  
  // Basic check for WebGL
  checkWebGL: () => {
    try {
      console.log('Checking WebGL directly');
      const offscreenCanvas = new OffscreenCanvas(1, 1);
      const gl = offscreenCanvas.getContext('webgl2') || 
                 offscreenCanvas.getContext('webgl') || 
                 offscreenCanvas.getContext('experimental-webgl');
      
      return {
        available: !!gl,
        info: gl ? 'WebGL Available' : 'WebGL Not Available'
      };
    } catch (e) {
      // Fallback if OffscreenCanvas isn't supported
      return { available: false, info: 'WebGL check failed' };
    }
  },
  
  // Simple log access
  getLogContent: () => {
    try {
      console.log('Reading logs directly');
      const userDataPath = ipcRenderer.sendSync('get-user-data-path');
      const logPath = path.join(userDataPath, 'nuru_browser.log');
      
      if (fs.existsSync(logPath)) {
        const data = fs.readFileSync(logPath, 'utf8');
        const lines = data.split('\n');
        return lines.slice(Math.max(0, lines.length - 200)).join('\n');
      }
      return 'No logs found.';
    } catch (e) {
      return `Error reading logs: ${e.message}`;
    }
  }
});

// Log completion
console.log('Simple diagnostics preload initialized successfully');
