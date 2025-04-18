/**
 * Nuru Browser - Enhanced Diagnostics Window
 * This is a complete rewrite of the diagnostics system with robust error handling,
 * improved UI/UX, and better performance monitoring capabilities.
 */

// Application start time for uptime calculation
const APP_START_TIME = Date.now();

// DOM Elements
// App Info Elements
const appNameElement = document.getElementById('app-name');
const appVersionElement = document.getElementById('app-version');
const electronVersionElement = document.getElementById('electron-version');
const chromeVersionElement = document.getElementById('chrome-version');
const nodeVersionElement = document.getElementById('node-version');
const platformElement = document.getElementById('platform');
const architectureElement = document.getElementById('architecture');
const updateStatusElement = document.getElementById('update-status');
const appInfoStatusElement = document.getElementById('app-info-status');

// System Info Elements
const cpuModelElement = document.getElementById('cpu-model');
const cpuCoresElement = document.getElementById('cpu-cores');
const totalMemoryElement = document.getElementById('total-memory');
const freeMemoryElement = document.getElementById('free-memory');
const osTypeElement = document.getElementById('os-type');
const osReleaseElement = document.getElementById('os-release');
const hostnameElement = document.getElementById('hostname');
const uptimeElement = document.getElementById('uptime');
const systemInfoStatusElement = document.getElementById('system-info-status');

// WebGL Elements
const webGLIndicator = document.getElementById('webgl-indicator');
const webGLStatusText = document.getElementById('webgl-status-text');
const webGLRenderer = document.getElementById('webgl-renderer');
const webGLVendor = document.getElementById('webgl-vendor');
const webGLVersion = document.getElementById('webgl-version');

// Log Elements
const logContentElement = document.getElementById('log-content');
const autoScrollToggle = document.getElementById('auto-scroll-toggle');
const autoRefreshToggle = document.getElementById('auto-refresh-toggle');

// Buttons
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const refreshInfoBtn = document.getElementById('refresh-info-btn');
const checkWebGLBtn = document.getElementById('check-webgl-btn');
const refreshLogsBtn = document.getElementById('refresh-logs-btn');
const clearLogsBtn = document.getElementById('clear-logs-btn');

// Other Elements
const currentTimeElement = document.getElementById('current-time');
const appUptimeElement = document.getElementById('app-uptime');

// Timer references for cleanup
let appInfoRefreshTimer = null;
let logRefreshTimer = null;
let uptimeTimer = null;
let timeUpdateTimer = null;

/**
 * Load and display application information
 */
async function loadAppInfo() {
  console.log('Loading application info...');
  setButtonLoading(refreshInfoBtn, true);
  updateStatusBadge(appInfoStatusElement, 'Loading...', 'normal');
  
  try {
    // Clear previous error status from elements
    resetErrorStates([
      electronVersionElement, chromeVersionElement, nodeVersionElement,
      platformElement, architectureElement, updateStatusElement
    ]);
    
    // Fetch application info
    const appInfo = await window.diagnosticsAPI.getAppInfo();
    console.log('App info received:', appInfo);
    
    // Update UI with received data
    appNameElement.textContent = appInfo.appName || 'Nuru Browser';
    appVersionElement.textContent = appInfo.appVersion || '1.0.0';
    
    // Check if this is a local fallback (partial info only)
    if (appInfo.isLocalFallback) {
      console.warn('Using local fallback for app info');
      updateStatusBadge(appInfoStatusElement, 'Partial Data Available', 'warning');
      
      // Set available values from fallback
      nodeVersionElement.textContent = appInfo.nodeVersion;
      platformElement.textContent = appInfo.platform;
      architectureElement.textContent = appInfo.arch;
      
      // Set error state for unavailable values
      electronVersionElement.textContent = appInfo.electronVersion;
      chromeVersionElement.textContent = appInfo.chromeVersion;
      updateStatusElement.textContent = appInfo.updateStatus;
      
      setErrorStatus([electronVersionElement, chromeVersionElement, updateStatusElement]);
    } else {
      // Full data available
      electronVersionElement.textContent = appInfo.electronVersion || 'Unknown';
      chromeVersionElement.textContent = appInfo.chromeVersion || 'Unknown';
      nodeVersionElement.textContent = appInfo.nodeVersion || 'Unknown';
      platformElement.textContent = appInfo.platform || 'Unknown';
      architectureElement.textContent = appInfo.arch || 'Unknown';
      updateStatusElement.textContent = appInfo.updateStatus || 'Unknown';
      
      updateStatusBadge(appInfoStatusElement, 'Data Loaded', 'success');
    }
    
    // Add success styling to all values
    document.querySelectorAll('#section-app-info .value').forEach(el => {
      if (!el.classList.contains('error')) {
        el.classList.add('success');
      }
    });
  } catch (error) {
    console.error('Failed to load app info:', error);
    updateStatusBadge(appInfoStatusElement, 'Failed to Load Data', 'error');
    
    // Set fallback values with error indication
    appNameElement.textContent = 'Nuru Browser';
    appVersionElement.textContent = '1.0.0';
    electronVersionElement.textContent = 'Error loading';
    chromeVersionElement.textContent = 'Error loading';
    nodeVersionElement.textContent = 'Error loading';
    platformElement.textContent = 'Error loading';
    architectureElement.textContent = 'Error loading';
    updateStatusElement.textContent = 'Error getting update status';
    
    // Add error styling
    setErrorStatus([
      electronVersionElement, chromeVersionElement, nodeVersionElement,
      platformElement, architectureElement, updateStatusElement
    ]);
  } finally {
    setButtonLoading(refreshInfoBtn, false);
  }
}

/**
 * Load and display system information
 */
async function loadSystemInfo() {
  console.log('Loading system info...');
  updateStatusBadge(systemInfoStatusElement, 'Loading...', 'normal');
  
  try {
    const sysInfo = await window.diagnosticsAPI.getSystemInfo();
    console.log('System info received:', sysInfo);
    
    if (sysInfo.error) {
      throw new Error(sysInfo.error);
    }
    
    // Update system info elements
    cpuModelElement.textContent = sysInfo.cpuModel || 'Unknown';
    cpuCoresElement.textContent = sysInfo.cpuCores || 'Unknown';
    totalMemoryElement.textContent = sysInfo.totalMemory ? `${sysInfo.totalMemory} GB` : 'Unknown';
    freeMemoryElement.textContent = sysInfo.freeMemory ? `${sysInfo.freeMemory} GB` : 'Unknown';
    osTypeElement.textContent = sysInfo.osType || 'Unknown';
    osReleaseElement.textContent = sysInfo.osRelease || 'Unknown';
    hostnameElement.textContent = sysInfo.hostname || 'Unknown';
    uptimeElement.textContent = sysInfo.uptime ? `${sysInfo.uptime} minutes` : 'Unknown';
    
    // Success status
    updateStatusBadge(systemInfoStatusElement, 'Data Loaded', 'success');
    
    // Add styling
    document.querySelectorAll('#section-system-info .value').forEach(el => {
      el.classList.add('success');
    });
  } catch (error) {
    console.error('Failed to load system info:', error);
    updateStatusBadge(systemInfoStatusElement, 'Failed to Load Data', 'error');
    
    // Set error status
    const elements = [
      cpuModelElement, cpuCoresElement, totalMemoryElement, freeMemoryElement,
      osTypeElement, osReleaseElement, hostnameElement, uptimeElement
    ];
    
    elements.forEach(el => {
      el.textContent = 'Error loading';
      el.classList.add('error');
    });
  }
}

/**
 * Check WebGL status and update the UI
 */
async function checkWebGL() {
  console.log('Checking WebGL status...');
  setButtonLoading(checkWebGLBtn, true);
  
  // Reset WebGL status indicators
  webGLIndicator.className = 'webgl-indicator';
  webGLStatusText.textContent = 'Checking WebGL...';
  webGLRenderer.textContent = 'Checking...';
  webGLVendor.textContent = 'Checking...';
  webGLVersion.textContent = 'Checking...';
  
  try {
    const webGLInfo = await window.diagnosticsAPI.checkWebGL();
    console.log('WebGL status received:', webGLInfo);
    
    if (webGLInfo.error) {
      throw new Error(webGLInfo.error);
    }
    
    if (webGLInfo.available) {
      // WebGL is available
      webGLIndicator.classList.add('success');
      webGLStatusText.textContent = webGLInfo.info || 'WebGL Available';
      webGLRenderer.textContent = webGLInfo.renderer || 'Not available';
      webGLVendor.textContent = webGLInfo.vendor || 'Not available';
      webGLVersion.textContent = `WebGL ${webGLInfo.version || '1.0'}`;
      
      // Add success styling
      webGLRenderer.classList.add('success');
      webGLVendor.classList.add('success');
      webGLVersion.classList.add('success');
    } else {
      // WebGL is not available
      webGLIndicator.classList.add('error');
      webGLStatusText.textContent = webGLInfo.info || 'WebGL Not Available';
      webGLRenderer.textContent = 'Not available';
      webGLVendor.textContent = 'Not available';
      webGLVersion.textContent = 'Not available';
      
      // Add error styling
      setErrorStatus([webGLRenderer, webGLVendor, webGLVersion]);
    }
  } catch (error) {
    console.error('Failed to check WebGL:', error);
    
    // Update UI with error status
    webGLIndicator.classList.add('error');
    webGLStatusText.textContent = 'Error checking WebGL';
    webGLRenderer.textContent = 'Error checking';
    webGLVendor.textContent = 'Error checking';
    webGLVersion.textContent = 'Error checking';
    
    // Add error styling
    setErrorStatus([webGLRenderer, webGLVendor, webGLVersion]);
  } finally {
    setButtonLoading(checkWebGLBtn, false);
  }
}

/**
 * Load and format application logs
 */
async function loadLogs() {
  try {
    setButtonLoading(refreshLogsBtn, true);
    
    // Show loading indicator if no content
    if (!logContentElement.textContent || logContentElement.textContent === 'No logs found or log file is empty.') {
      logContentElement.textContent = 'Loading logs...';
    }
    
    console.log('Reading log file...');
    const logContent = await window.diagnosticsAPI.readLogFile();
    
    // Handle empty logs
    if (!logContent || logContent === 'No logs found.') {
      logContentElement.textContent = 'No logs found or log file is empty.';
      return;
    }
    
    // Format log entries for better readability
    const formattedContent = logContent
      .split('\n')
      .map(line => {
        // Add color to different log levels
        if (line.includes('[error]') || line.includes('ERROR')) {
          return `<span class="log-error">${escapeHtml(line)}</span>`;
        } else if (line.includes('[warn]') || line.includes('WARNING')) {
          return `<span class="log-warning">${escapeHtml(line)}</span>`;
        } else if (line.includes('[info]') || line.match(/INFO|›/)) {
          return `<span class="log-info">${escapeHtml(line)}</span>`;
        }
        return escapeHtml(line);
      })
      .join('\n');
    
    // Use innerHTML to render the formatted content
    logContentElement.innerHTML = formattedContent;
    
    // Auto-scroll to bottom if enabled
    if (autoScrollToggle.checked) {
      const logContainer = logContentElement.parentElement;
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    console.log('Logs loaded successfully');
  } catch (error) {
    console.error('Failed to load logs:', error);
    logContentElement.innerHTML = `<span class="log-error">Error loading logs: ${escapeHtml(error.message)}</span>`;
  } finally {
    setButtonLoading(refreshLogsBtn, false);
  }
}

/**
 * Check for application updates
 */
async function checkForUpdates() {
  console.log('Checking for updates...');
  setButtonLoading(checkUpdatesBtn, true);
  updateStatusElement.textContent = 'Checking for updates...';
  
  try {
    const updateResult = await window.diagnosticsAPI.checkForUpdates();
    console.log('Update check result:', updateResult);
    
    if (updateResult.success === false) {
      throw new Error(updateResult.error || 'Unknown error checking for updates');
    }
    
    // Refresh app info to get latest update status
    await loadAppInfo();
    
  } catch (error) {
    console.error('Failed to check for updates:', error);
    updateStatusElement.textContent = 'Failed to check for updates';
    updateStatusElement.classList.add('error');
  } finally {
    setButtonLoading(checkUpdatesBtn, false);
  }
}

/**
 * Setup automatic refresh for logs if enabled
 */
function setupLogAutoRefresh() {
  // Clear existing timer
  if (logRefreshTimer) {
    clearInterval(logRefreshTimer);
    logRefreshTimer = null;
  }
  
  // Setup new timer if auto-refresh is enabled
  if (autoRefreshToggle.checked) {
    logRefreshTimer = setInterval(loadLogs, 5000);
    console.log('Log auto-refresh enabled (5s interval)');
  } else {
    console.log('Log auto-refresh disabled');
  }
}

/**
 * Update the current time display
 */
function updateCurrentTime() {
  const now = new Date();
  currentTimeElement.textContent = `Refreshed: ${now.toLocaleTimeString()}`;
}

/**
 * Update the application uptime display
 */
function updateAppUptime() {
  const uptime = Math.floor((Date.now() - APP_START_TIME) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  
  // Format: HH:MM:SS
  const formattedUptime = [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');
  
  appUptimeElement.textContent = `Uptime: ${formattedUptime}`;
}

// Event listeners
checkUpdatesBtn.addEventListener('click', checkForUpdates);
refreshInfoBtn.addEventListener('click', () => {
  loadAppInfo();
  loadSystemInfo();
});
checkWebGLBtn.addEventListener('click', checkWebGL);
refreshLogsBtn.addEventListener('click', loadLogs);
clearLogsBtn.addEventListener('click', () => {
  logContentElement.textContent = 'Logs cleared from view. Click Refresh to reload.';
});

// Auto-refresh toggle
autoRefreshToggle.addEventListener('change', setupLogAutoRefresh);

// Utility functions
/**
 * Set a button's loading state
 */
function setButtonLoading(button, isLoading) {
  if (isLoading) {
    button.classList.add('loading');
    button.disabled = true;
  } else {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

/**
 * Update a status badge's text and state
 */
function updateStatusBadge(element, text, state) {
  element.textContent = text;
  
  // Reset existing classes
  element.className = 'status-badge';
  
  // Add appropriate state class
  if (state === 'success') {
    element.classList.add('success');
  } else if (state === 'error') {
    element.classList.add('error');
  } else if (state === 'warning') {
    element.classList.add('warning');
  }
}

/**
 * Set error status on elements
 */
function setErrorStatus(elements) {
  elements.forEach(el => {
    el.classList.remove('success');
    el.classList.add('error');
  });
}

/**
 * Reset error states on elements
 */
function resetErrorStates(elements) {
  elements.forEach(el => {
    el.classList.remove('error', 'success');
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Setup timers for updating dynamic content
 */
function setupTimers() {
  // Update current time every minute
  updateCurrentTime();
  timeUpdateTimer = setInterval(updateCurrentTime, 60000);
  
  // Update uptime every second
  updateAppUptime();
  uptimeTimer = setInterval(updateAppUptime, 1000);
  
  // Periodically refresh app info
  appInfoRefreshTimer = setInterval(() => {
    loadAppInfo();
    loadSystemInfo();
  }, 300000); // Every 5 minutes
}

/**
 * Cleanup timers when window is closed
 */
function cleanupTimers() {
  if (logRefreshTimer) clearInterval(logRefreshTimer);
  if (appInfoRefreshTimer) clearInterval(appInfoRefreshTimer);
  if (uptimeTimer) clearInterval(uptimeTimer);
  if (timeUpdateTimer) clearInterval(timeUpdateTimer);
}

/**
 * Initialize diagnostics window
 */
function initialize() {
  console.log('Initializing enhanced diagnostics window...');
  
  // Load initial data
  Promise.all([
    loadAppInfo(),
    loadSystemInfo(),
    checkWebGL(),
    loadLogs()
  ]).then(() => {
    console.log('Initial data loaded successfully');
  }).catch(error => {
    console.error('Error loading initial data:', error);
  });
  
  // Setup auto-refresh for logs
  setupLogAutoRefresh();
  
  // Setup other timers
  setupTimers();
  
  // Add window unload handler to clean up
  window.addEventListener('beforeunload', cleanupTimers);
  
  console.log('Diagnostics window initialized');
}

// Start initialization when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  // DOM already loaded
  initialize();
}
