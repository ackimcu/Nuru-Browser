// DOM Elements
const appNameElement = document.getElementById('app-name');
const appVersionElement = document.getElementById('app-version');
const electronVersionElement = document.getElementById('electron-version');
const chromeVersionElement = document.getElementById('chrome-version');
const nodeVersionElement = document.getElementById('node-version');
const platformElement = document.getElementById('platform');
const architectureElement = document.getElementById('architecture');
const updateStatusElement = document.getElementById('update-status');
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const webGLStatusElement = document.getElementById('webgl-status');
const webGLTextElement = document.getElementById('webgl-text');
const logContentElement = document.getElementById('log-content');

// Functions
async function loadAppInfo() {
  try {
    const appInfo = await window.diagnosticsAPI.getAppInfo();
    
    // Set values and add a visual indicator that they're loaded
    appNameElement.textContent = appInfo.appName || 'Nuru Browser';
    appVersionElement.textContent = appInfo.appVersion || '1.0.0';
    electronVersionElement.textContent = appInfo.electronVersion || 'Unknown';
    chromeVersionElement.textContent = appInfo.chromeVersion || 'Unknown';
    nodeVersionElement.textContent = appInfo.nodeVersion || 'Unknown';
    platformElement.textContent = appInfo.platform || 'Unknown';
    architectureElement.textContent = appInfo.arch || 'Unknown';
    updateStatusElement.textContent = appInfo.updateStatus || 'Unknown';
    
    // Add success styling
    document.querySelectorAll('#app-info td:nth-child(2)').forEach(el => {
      el.classList.add('info-loaded');
    });
    
    console.log('App info loaded successfully', appInfo);
  } catch (error) {
    console.error('Failed to load app info:', error);
    
    // Set fallback values
    appNameElement.textContent = 'Nuru Browser';
    appVersionElement.textContent = '1.0.0';
    electronVersionElement.textContent = 'Error loading';
    chromeVersionElement.textContent = 'Error loading';
    nodeVersionElement.textContent = 'Error loading';
    platformElement.textContent = 'Error loading';
    architectureElement.textContent = 'Error loading';
    updateStatusElement.textContent = 'Error getting update status';
    
    // Add error styling
    document.querySelectorAll('#app-info td:nth-child(2)').forEach(el => {
      el.classList.add('info-error');
    });
    
    // Try loading again after a delay
    setTimeout(loadAppInfo, 3000);
  }
}

function checkWebGL() {
  try {
    // First remove any existing classes to allow rechecking
    webGLStatusElement.classList.remove('success', 'error');
    webGLTextElement.textContent = 'Checking WebGL status...';
    
    // Try to get WebGL context
    const hasWebGL = window.diagnosticsAPI.checkWebGL();
    
    if (hasWebGL) {
      webGLStatusElement.classList.add('success');
      webGLTextElement.textContent = 'WebGL Available';
      console.log('WebGL is available');
    } else {
      webGLStatusElement.classList.add('error');
      webGLTextElement.textContent = 'WebGL Unavailable';
      console.log('WebGL is not available');
    }
  } catch (error) {
    console.error('Error checking WebGL:', error);
    webGLStatusElement.classList.add('error');
    webGLTextElement.textContent = 'Error checking WebGL';
    
    // Try again after a delay
    setTimeout(checkWebGL, 2000);
  }
}

async function loadLogs() {
  try {
    // Show loading indicator
    if (!logContentElement.textContent) {
      logContentElement.textContent = 'Loading logs...';
    }
    
    const logContent = await window.diagnosticsAPI.readLogFile();
    
    if (!logContent || logContent === 'No logs found.') {
      logContentElement.textContent = 'No logs found or log file is empty.';
      return;
    }
    
    logContentElement.textContent = logContent;
    
    // Format log entries for better readability
    const formattedContent = logContent
      .split('\n')
      .map(line => {
        // Add color to different log levels
        if (line.includes('[error]')) {
          return `<span class="log-error">${line}</span>`;
        } else if (line.includes('[warn]')) {
          return `<span class="log-warning">${line}</span>`;
        } else if (line.includes('[info]')) {
          return `<span class="log-info">${line}</span>`;
        }
        return line;
      })
      .join('\n');
    
    // Use innerHTML to render the formatted content
    logContentElement.innerHTML = formattedContent;
    
    // Auto-scroll to bottom
    setTimeout(() => {
      const logContainer = logContentElement.parentElement;
      logContainer.scrollTop = logContainer.scrollHeight;
    }, 100);
    
    console.log('Logs loaded successfully');
  } catch (error) {
    console.error('Failed to load logs:', error);
    logContentElement.innerHTML = `<span class="log-error">Error loading logs: ${error.message}</span>`;
    
    // Try again after a delay
    setTimeout(loadLogs, 5000);
  }
}

// Auto-refresh logs
function setupAutoRefresh() {
  // Refresh logs every 5 seconds
  setInterval(loadLogs, 5000);
  
  // Clear logs after 3 minutes (refresh every 180 seconds)
  setInterval(() => {
    // Preserve scroll position
    const logContainer = logContentElement.parentElement;
    const wasAtBottom = logContainer.scrollHeight - logContainer.clientHeight <= logContainer.scrollTop + 5;
    
    // Reload logs
    loadLogs().then(() => {
      // Restore scroll position if was at bottom
      if (wasAtBottom) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    });
  }, 180000);
}

// Check for updates
checkUpdatesBtn.addEventListener('click', () => {
  updateStatusElement.textContent = 'Checking for updates...';
  updateStatusElement.classList.add('checking');
  checkUpdatesBtn.disabled = true;
  checkUpdatesBtn.classList.add('loading');
  
  try {
    window.diagnosticsAPI.checkForUpdates();
    
    // Update status and re-enable button after a delay
    setTimeout(() => {
      loadAppInfo();
      checkUpdatesBtn.disabled = false;
      checkUpdatesBtn.classList.remove('loading');
      updateStatusElement.classList.remove('checking');
    }, 3000);
  } catch (error) {
    console.error('Failed to check for updates:', error);
    updateStatusElement.textContent = 'Failed to check for updates';
    updateStatusElement.classList.add('error');
    checkUpdatesBtn.disabled = false;
    checkUpdatesBtn.classList.remove('loading');
  }
});

// Initialize with retry mechanism
function initialize() {
  console.log('Initializing diagnostics window...');
  
  // Load app info
  loadAppInfo()
    .then(() => console.log('App info loaded'))
    .catch(err => console.error('Error loading app info:', err));
  
  // Check WebGL
  checkWebGL();
  
  // Load logs
  loadLogs()
    .then(() => console.log('Logs loaded'))
    .catch(err => console.error('Error loading logs:', err));
  
  // Setup auto-refresh
  setupAutoRefresh();
  
  console.log('Diagnostics initialization complete');
}

// Start initialization
document.addEventListener('DOMContentLoaded', initialize);

// Call initialize immediately if the DOM is already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initialize();
}
