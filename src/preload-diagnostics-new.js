// Nuru Browser Diagnostics - Preload Script
const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// For debugging
console.log('[Diagnostics] Preload script starting');

/**
 * Enhanced diagnostics API with robust error handling
 * Implements timeout protection, retries, and detailed error tracking
 */
try {
  // Log environment information for troubleshooting
  console.log('[Diagnostics] Node version:', process.versions.node);
  console.log('[Diagnostics] Electron version:', process.versions.electron);
  console.log('[Diagnostics] Chrome version:', process.versions.chrome);
  console.log('[Diagnostics] Operating system:', os.platform(), os.release());
  
  // Define the diagnostics API with reliable fallbacks for every function
  const diagnosticsAPI = {
    // System information
    getAppInfo: async () => {
      console.log('[Diagnostics] Requesting app info');
      try {
        // Setup timeout protection
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('App info request timed out after 8000ms')), 8000)
        );
        
        // Main request with retry mechanism
        const fetchAppInfo = async (retryCount = 0, maxRetries = 2) => {
          try {
            console.log(`[Diagnostics] Attempt ${retryCount + 1} to get app info`);
            // First try the v2 API
            try {
              return await ipcRenderer.invoke('get-app-info-v2');
            } catch (err) {
              console.log('[Diagnostics] Falling back to legacy API');
              // If the v2 fails, try the legacy API
              return await ipcRenderer.invoke('get-app-info');
            }
          } catch (error) {
            console.error(`[Diagnostics] App info fetch error (attempt ${retryCount + 1}):`, error);
            if (retryCount < maxRetries) {
              // Exponential backoff for retries
              const delay = Math.pow(2, retryCount) * 1000;
              await new Promise(resolve => setTimeout(resolve, delay));
              return fetchAppInfo(retryCount + 1, maxRetries);
            }
            throw error;
          }
        };

        // Race between the fetch and the timeout
        const result = await Promise.race([fetchAppInfo(), timeoutPromise]);
        console.log('[Diagnostics] App info received successfully:', result);
        return result;
      } catch (error) {
        console.error('[Diagnostics] Failed to get app info:', error);
        
        // Fallback with local system info when main process fails
        const fallbackInfo = {
          appName: 'Nuru Browser',
          appVersion: '1.0.0',
          isLocalFallback: true,
          error: error.message,
          // Try to gather some basic info locally
          nodeVersion: process.versions.node || 'Unavailable',
          platform: os.platform() || 'Unavailable',
          arch: os.arch() || 'Unavailable',
          // The following can't be reliably determined in the renderer
          electronVersion: 'Unavailable (IPC failed)',
          chromeVersion: 'Unavailable (IPC failed)',
          updateStatus: 'Unknown (IPC failed)'
        };
        
        console.log('[Diagnostics] Using fallback app info:', fallbackInfo);
        return fallbackInfo;
      }
    },
    
    // Update check functionality
    checkForUpdates: async () => {
      console.log('[Diagnostics] Requesting update check');
      try {
        // Try the v2 API first
        try {
          return await ipcRenderer.invoke('check-for-updates-v2');
        } catch (err) {
          console.log('[Diagnostics] Falling back to legacy update API');
          // If v2 fails, try the legacy method
          ipcRenderer.send('check-for-updates');
          return { success: true, message: 'Update check initiated via legacy API' };
        }
      } catch (error) {
        console.error('[Diagnostics] Update check error:', error);
        return { success: false, error: error.message };
      }
    },
    
    // Log file handling
    getLogPath: async () => {
      try {
        try {
          return await ipcRenderer.invoke('get-log-path-v2');
        } catch (err) {
          console.log('[Diagnostics] Falling back to legacy log path API');
          return await ipcRenderer.invoke('get-log-path');
        }
      } catch (error) {
        console.error('[Diagnostics] Error getting log path:', error);
        // Return a default location if IPC fails
        return path.join(os.homedir(), '.nuru-browser', 'logs', 'nuru_browser.log');
      }
    },
    
    readLogFile: async () => {
      try {
        console.log('[Diagnostics] Reading log file');
        
        // Try to get the log path using available methods
        let logPath;
        try {
          logPath = await ipcRenderer.invoke('get-log-path-v2');
        } catch (err) {
          try {
            logPath = await ipcRenderer.invoke('get-log-path');
          } catch (err2) {
            logPath = path.join(os.homedir(), '.nuru-browser', 'logs', 'nuru_browser.log');
          }
        }
        
        console.log('[Diagnostics] Log path:', logPath);
        
        // Safely read the log file
        if (fs.existsSync(logPath)) {
          const data = fs.readFileSync(logPath, 'utf8');
          
          // Get the last 500 lines for more comprehensive logs
          const lines = data.split('\n');
          return lines.slice(Math.max(0, lines.length - 500)).join('\n');
        }
        return 'No logs found or log file is empty.';
      } catch (error) {
        console.error('[Diagnostics] Error reading log file:', error);
        return `Error reading log file: ${error.message}`;
      }
    },
    
    // Enhanced WebGL checking
    checkWebGL: () => {
      try {
        console.log('[Diagnostics] Checking WebGL support');
        // Create an offscreen canvas for WebGL detection
        const canvas = document.createElement('canvas');
        
        // Try WebGL2 first (more modern)
        let gl = canvas.getContext('webgl2');
        if (gl) {
          return { 
            available: true, 
            version: 2,
            renderer: gl.getParameter(gl.RENDERER),
            vendor: gl.getParameter(gl.VENDOR),
            info: "WebGL 2.0 Available" 
          };
        }
        
        // Fall back to WebGL1
        gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          return { 
            available: true, 
            version: 1,
            renderer: gl.getParameter(gl.RENDERER),
            vendor: gl.getParameter(gl.VENDOR),
            info: "WebGL 1.0 Available" 
          };
        }
        
        return { available: false, info: "WebGL Not Available" };
      } catch (error) {
        console.error('[Diagnostics] WebGL check error:', error);
        return { 
          available: false, 
          error: error.message,
          info: "Error checking WebGL" 
        };
      }
    },
    
    // System diagnostics
    getSystemInfo: () => {
      try {
        console.log('[Diagnostics] Getting system info');
        return {
          cpuModel: os.cpus()[0]?.model || 'Unknown',
          cpuCores: os.cpus().length,
          totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10, // GB
          freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024) * 10) / 10, // GB
          uptime: Math.floor(os.uptime() / 60), // minutes
          hostname: os.hostname(),
          osType: os.type(),
          osRelease: os.release()
        };
      } catch (error) {
        console.error('[Diagnostics] System info error:', error);
        return { error: error.message };
      }
    }
  };

  // Expose the diagnostics API to the renderer process
  contextBridge.exposeInMainWorld('diagnosticsAPI', diagnosticsAPI);
  console.log('[Diagnostics] API exposed successfully');
} catch (error) {
  console.error('[Diagnostics] Critical error in preload script:', error);
}

// Log when the preload script has completed
console.log('[Diagnostics] Preload script initialization completed');
