// DOM Elements
const webviewsContainer = document.getElementById('webviews-container');
const activeWebview = document.getElementById('webview-0');
const tabsList = document.getElementById('tabs-list');
const tabsViewport = document.querySelector('.tabs-viewport');
const tabsTriggerArea = document.querySelector('.tabs-trigger-area');
const urlInput = document.getElementById('url-search-input');
const urlSuggestions = document.getElementById('url-suggestions');
const searchEngineButton = document.getElementById('search-engine-button');
const searchEngineSelector = document.getElementById('search-engine-selector');
const appContainer = document.getElementById('app');
const loadingStrip = document.getElementById('loading-strip');
const securityIndicator = document.getElementById('url-security-indicator');
const urlViewport = document.querySelector('.url-search-section');
const errorOverlay = document.getElementById('error-overlay');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const errorDismiss = document.getElementById('error-dismiss');
const updateCheckBtn = document.getElementById('update-check-btn');
const diagnosticsBtn = document.getElementById('diagnostics-btn');

// Settings
let settings = {
  dark_mode: true,
  frameless: true,
  zoom_factor: 1.5,
  search_engine: {
    name: 'google',
    url: 'https://www.google.com/search?q=',
    icon: 'fab fa-google'
  }
};

// URL management
let currentUrl = 'https://www.google.com/';
let searchTimeout = null;
let urlSuggestionResults = [];

// Tab management
let tabs = [];
let activeTabId = 'webview-0';
let tabCounter = 1; // Start at 1 since webview-0 is already created

// Load settings on startup
async function loadSettings() {
  try {
    const loadedSettings = await window.electronAPI.getSettings();
    if (loadedSettings) {
      settings = loadedSettings;
      applySettings();
      // Initialize search engine UI
      updateSearchEngineUI();
      logMessage('info', 'Settings loaded successfully');
    } else {
      logMessage('warn', 'Settings returned empty, using defaults');
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    logMessage('error', `Settings error: ${error.message}`);
    // Don't show error to user, just use defaults
  }
}

// Apply settings to the UI
function applySettings() {
  if (settings.dark_mode) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  
  // Only apply zoom factor if webview is loaded
  if (webview && webview.getWebContentsId) {
    try {
      webview.setZoomFactor(settings.zoom_factor);
    } catch (error) {
      console.log('Zoom will be applied when webview is ready');
      // We'll apply zoom when the dom-ready event fires
    }
  }
}

// WebGL check
function checkWebGL() {
  const hasWebGL = window.electronAPI.checkWebGL();
  logMessage('info', `WebGL status: ${hasWebGL ? 'Available' : 'Unavailable'}`);
  return hasWebGL;
}

// Log message to the main process
function logMessage(level, message) {
  window.electronAPI.logMessage(level, message);
}

// Show error overlay
function showError(title, message) {
  errorTitle.textContent = title;
  errorMessage.textContent = message;
  errorOverlay.classList.remove('hidden');
  
  logMessage('error', `${title}: ${message}`);
}

// Show notification
function showNotification(title, message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  const notificationTitle = document.createElement('div');
  notificationTitle.className = 'notification-title';
  notificationTitle.textContent = title;
  
  const notificationMessage = document.createElement('div');
  notificationMessage.className = 'notification-message';
  notificationMessage.textContent = message;
  
  notification.appendChild(notificationTitle);
  notification.appendChild(notificationMessage);
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Auto dismiss
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);

  logMessage('info', `Notification: ${title} - ${message}`);
}

// Initialize Tab Management
function initializeTabs() {
  // Add the initial tab to the tabs array
  tabs.push({
    id: 'webview-0',
    title: 'Google',
    url: 'https://www.google.com/',
    favicon: null
  });
  
  // Add it to the tabs list UI
  updateTabsUI();
  
  // Set up event listeners for the first webview
  setupWebviewEvents(activeWebview);
}

// Create a new tab
function createTab(url = 'https://www.google.com/') {
  const tabId = `webview-${tabCounter++}`;
  
  // Create the webview element
  const newWebview = document.createElement('webview');
  newWebview.id = tabId;
  newWebview.src = url;
  newWebview.setAttribute('allowpopups', '');
  newWebview.setAttribute('partition', 'persist:browsing');
  newWebview.setAttribute('webpreferences', 'allowRunningInsecureContent=yes, javascript=yes');
  newWebview.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');
  
  // Add it to the DOM
  webviewsContainer.appendChild(newWebview);
  
  // Start loading animation
  startLoadingAnimation();
  
  // Add to tabs array
  tabs.push({
    id: tabId,
    title: 'New Tab',
    url: url,
    favicon: null,
    createdAt: Date.now()
  });
  
  // Setup event listeners
  setupWebviewEvents(newWebview);
  
  // Switch to the new tab
  switchToTab(tabId);
  
  logMessage('info', `Created new tab with ID: ${tabId}`);
  
  return tabId;
}

// Switch to a specific tab
function switchToTab(tabId) {
  // Hide all webviews
  document.querySelectorAll('webview').forEach(webview => {
    webview.classList.remove('active');
  });
  
  // Show the selected webview
  const selectedWebview = document.getElementById(tabId);
  if (selectedWebview) {
    selectedWebview.classList.add('active');
    activeTabId = tabId;
    
    // Apply zoom factor
    try {
      selectedWebview.setZoomFactor(settings.zoom_factor);
    } catch (error) {
      logMessage('warn', `Failed to apply zoom to tab ${tabId}: ${error.message}`);
    }
    
    // Update the tabs UI
    updateTabsUI();
    
    // Update URL input with the webview's current URL
    try {
      updateUrlInput(selectedWebview.getURL());
    } catch (error) {
      logMessage('warn', `Failed to update URL input: ${error.message}`);
    }
    
    // No CSS injection is performed
  }
}

// Close a tab
function closeTab(tabId) {
  // Don't do anything if there's no tab ID
  if (!tabId) return;
  
  // Find the tab in the tabs array
  const tabIndex = tabs.findIndex(tab => tab.id === tabId);
  if (tabIndex === -1) {
    logMessage('warn', `Attempted to close non-existent tab: ${tabId}`);
    return;
  }
  
  const closedTab = tabs[tabIndex];
  logMessage('info', `Closing tab: ${closedTab.title} (${tabId})`);
  
  // Remove it from the array
  tabs.splice(tabIndex, 1);
  
  // Remove the webview element with a smooth fade-out effect
  const webview = document.getElementById(tabId);
  if (webview) {
    // Add a fade-out class for animation
    webview.classList.add('fade-out');
    
    // Remove after animation completes
    setTimeout(() => {
      if (webviewsContainer.contains(webview)) {
        webviewsContainer.removeChild(webview);
      }
    }, 250);
  }
  
  // If there are no more tabs, create a new one
  if (tabs.length === 0) {
    createTab();
    return;
  }
  
  // If the closed tab was active, switch to another tab
  if (tabId === activeTabId) {
    // Try to switch to the tab to the left, if not available go to the right
    const newActiveTab = tabs[Math.max(0, tabIndex - 1)];
    switchToTab(newActiveTab.id);
  }
  
  // Update the UI
  updateTabsUI();
}

// Update the tabs UI
function updateTabsUI() {
  // Clear the tabs list
  tabsList.innerHTML = '';
  
  // Sort tabs by creation time to ensure consistent order
  const sortedTabs = [...tabs].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  
  // Add each tab to the list
  sortedTabs.forEach(tab => {
    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';
    tabItem.dataset.tabId = tab.id;
    
    if (tab.id === activeTabId) {
      tabItem.classList.add('active');
    }
    
    const faviconElement = document.createElement('div');
    faviconElement.className = 'tab-favicon';
    
    // Set favicon if available, with fallback handling
    if (tab.favicon) {
      const faviconImg = document.createElement('img');
      faviconImg.src = tab.favicon;
      faviconImg.alt = '';
      faviconImg.onerror = () => {
        // Replace broken favicon with default icon
        faviconElement.innerHTML = '<i class="fas fa-globe"></i>';
      };
      faviconElement.appendChild(faviconImg);
    } else {
      // Use appropriate default icon based on domain
      const domain = tab.url ? new URL(tab.url).hostname : '';
      
      if (domain.includes('google')) {
        faviconElement.innerHTML = '<i class="fab fa-google"></i>';
      } else {
        faviconElement.innerHTML = '<i class="fas fa-globe"></i>';
      }
    }
    
    const titleElement = document.createElement('div');
    titleElement.className = 'tab-title';
    titleElement.textContent = tab.title || 'New Tab';
    titleElement.title = tab.title || 'New Tab'; // Add tooltip for long titles
    
    const closeElement = document.createElement('div');
    closeElement.className = 'tab-close';
    closeElement.innerHTML = '<i class="fas fa-times"></i>';
    closeElement.title = 'Close tab';
    
    tabItem.appendChild(faviconElement);
    tabItem.appendChild(titleElement);
    tabItem.appendChild(closeElement);
    
    // Event listeners
    tabItem.addEventListener('click', (event) => {
      // Don't switch if clicking the close button
      if (!closeElement.contains(event.target)) {
        switchToTab(tab.id);
        hideTabsViewport(); // Auto-hide tabs after selection
      }
    });
    
    // Add double click to rename tab (future feature)
    titleElement.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      // Could implement tab renaming in the future
    });
    
    // Close button with animation
    closeElement.addEventListener('click', (event) => {
      event.stopPropagation();
      // Add click animation
      closeElement.classList.add('clicked');
      setTimeout(() => closeTab(tab.id), 150);
    });
    
    // Add tab to the list
    tabsList.appendChild(tabItem);
  });
  
  // Add a 'new tab' button
  const newTabButton = document.createElement('div');
  newTabButton.className = 'tab-item new-tab';
  
  const newTabIcon = document.createElement('div');
  newTabIcon.className = 'tab-favicon';
  newTabIcon.innerHTML = '<i class="fas fa-plus"></i>';
  
  const newTabText = document.createElement('div');
  newTabText.className = 'tab-title';
  newTabText.textContent = 'New Tab';
  
  newTabButton.appendChild(newTabIcon);
  newTabButton.appendChild(newTabText);
  
  newTabButton.addEventListener('click', () => {
    createTab();
    // Don't auto-hide tabs when creating a new tab
  });
  
  tabsList.appendChild(newTabButton);
  
  // Update tab count indicator if needed
  updateTabCounter();
}

// Update tab counter
function updateTabCounter() {
  // Future feature: Could show tab count in UI
  logMessage('info', `Active tabs: ${tabs.length}`);
}

// Setup event listeners for a webview
function setupWebviewEvents(webviewElement) {
  // Inject custom scrollbar styling
  injectScrollbarCSS(webviewElement);
  webviewElement.addEventListener('did-start-loading', () => {
    // Add a loading indicator for this tab
    const tabId = webviewElement.id;
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.isLoading = true;
      updateTabsUI();
    }
  });
  
  webviewElement.addEventListener('did-stop-loading', () => {
    // Remove loading indicator
    const tabId = webviewElement.id;
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.isLoading = false;
      updateTabsUI();
    }
  });
  
  // Update tab title and favicon when it changes
  webviewElement.addEventListener('page-title-updated', (event) => {
    const tabIndex = tabs.findIndex(tab => tab.id === webviewElement.id);
    if (tabIndex !== -1) {
      tabs[tabIndex].title = event.title || 'Untitled';
      if (webviewElement.classList.contains('active')) {
        document.title = `${event.title} - CB Loader`;
      }
      updateTabsUI();
    }
  });
  
  // Capture favicons for tabs
  webviewElement.addEventListener('page-favicon-updated', (event) => {
    if (event.favicons && event.favicons.length > 0) {
      const tabIndex = tabs.findIndex(tab => tab.id === webviewElement.id);
      if (tabIndex !== -1) {
        tabs[tabIndex].favicon = event.favicons[0];
        updateTabsUI();
      }
    }
  });
  
  // Track URL changes
  webviewElement.addEventListener('did-navigate', (event) => {
    const tabId = webviewElement.id;
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.url = event.url;
      
      // Only update URL if this is the active tab
      if (webviewElement.classList.contains('active')) {
        updateNavigationButtons();
        updateUrlInput(event.url);
      }
    }
  });
  
  // Show loading status with progress tracking
  let loadingProgressValue = 0;
  let progressInterval;
  
  webviewElement.addEventListener('did-start-loading', () => {
    // Start loading animation
    startLoadingAnimation();
    
    // Reset progress
    loadingProgressValue = 0;
    
    // Simulate progress for better user experience
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      // Increment progress but slow down as we approach 90%
      const increment = loadingProgressValue < 30 ? 10 : 
                       loadingProgressValue < 60 ? 5 : 
                       loadingProgressValue < 80 ? 2 : 1;
      
      loadingProgressValue = Math.min(90, loadingProgressValue + increment);
      
      // Update progress in 25% increments for the loading strip
      if (loadingProgressValue >= 75 && loadingProgressValue < 90) {
        updateLoadingProgress(75);
      } else if (loadingProgressValue >= 50 && loadingProgressValue < 75) {
        updateLoadingProgress(50);
      } else if (loadingProgressValue >= 25 && loadingProgressValue < 50) {
        updateLoadingProgress(25);
      }
      
      // Stop when we reach 90% - the rest will happen when the page finishes loading
      if (loadingProgressValue >= 90) {
        clearInterval(progressInterval);
      }
    }, 200);
  });
  
  webviewElement.addEventListener('did-stop-loading', () => {
    // Clear the simulated progress interval
    clearInterval(progressInterval);
    
    // Complete the loading animation
    completeLoadingAnimation();
    
    // Update CSS for active webview
    if (webviewElement.classList.contains('active')) {
      // No CSS injection is performed
    }
  });
  
  // Track loading progress
  webviewElement.addEventListener('did-start-navigation', () => {
    if (webviewElement.classList.contains('active')) {
      updateLoadingProgress(25);
    }
  });
  
  webviewElement.addEventListener('will-navigate', () => {
    if (webviewElement.classList.contains('active')) {
      updateLoadingProgress(50);
    }
  });
  
  webviewElement.addEventListener('did-navigate', () => {
    if (webviewElement.classList.contains('active')) {
      updateLoadingProgress(75);
      
      // Update security indicator when navigation completes
      const currentUrl = webviewElement.getURL();
      updateSecurityIndicator(currentUrl);
      
      // Update URL input if URL viewport is active
      if (urlViewport.classList.contains('active')) {
        urlInput.value = currentUrl;
      }
    }
  });
  
  webviewElement.addEventListener('did-frame-finish-load', () => {
    if (webviewElement.classList.contains('active')) {
      updateLoadingProgress(90);
    }
  });
  
  webviewElement.addEventListener('did-navigate-in-page', (event) => {
    // Update URL on SPA navigation
    if (webviewElement.classList.contains('active')) {
      updateUrlInput(event.url);
    }
  });
  
  // Handle webview ready
  webviewElement.addEventListener('dom-ready', () => {
    // Apply zoom factor
    try {
      webviewElement.setZoomFactor(settings.zoom_factor);
    } catch (error) {
      logMessage('error', `Failed to apply zoom: ${error.message}`);
    }
  });
  
  // Handle certificate errors
  webviewElement.addEventListener('certificate-error', (event) => {
    // Allow certificate errors but update security indicator
    event.preventDefault();
    event.continue();
    
    // Find the tab with this webview ID
    const tab = tabs.find(tab => tab.id === webviewElement.id);
    if (tab) {
      tab.hasSecurityIssue = true;
      
      // Update security indicator if active tab
      if (webviewElement.classList.contains('active')) {
        securityIndicator.classList.remove('secure');
        securityIndicator.classList.add('not-secure');
        securityIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        securityIndicator.title = 'Certificate error: Connection not secure';
      }
    }
    
    logMessage('warn', `Certificate error: ${event.url}`);
  });
  
  // Handle load errors
  webviewElement.addEventListener('did-fail-load', (event) => {
    if (event.errorCode !== -3 && event.errorCode !== 0) { // Ignore aborted loads
      logMessage('error', `Failed to load: ${event.errorDescription} (${event.errorCode})`);
    }
  });
  
  // Track load time
  let startTime;
  
  // Handle permission requests
  webviewElement.addEventListener('permission-request', (event) => {
    // Auto-allow certain permissions
    if (['media', 'fullscreen'].includes(event.permission)) {
      event.request.grant();
      logMessage('info', `Auto-granted ${event.permission} permission`);
    } else {
      // Deny other permissions
      event.request.deny();
      logMessage('info', `Auto-denied ${event.permission} permission`);
    }
  });
}

// Inject custom CSS for scrollbar styling in webviews
function injectScrollbarCSS(webviewElement) {
  const scrollbarCSS = `
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    ::-webkit-scrollbar-track {
      background: transparent;
      border-radius: 10px;
      margin: 2px;
    }
    
    ::-webkit-scrollbar-thumb {
      background: rgba(100, 100, 100, 0.4);
      border-radius: 10px;
      border: 2px solid transparent;
      background-clip: padding-box;
      transition: background-color 0.2s ease;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(120, 120, 120, 0.6);
      border: 2px solid transparent;
      background-clip: padding-box;
    }
    
    ::-webkit-scrollbar-corner {
      background: transparent;
    }
  `;
  
  webviewElement.addEventListener('dom-ready', () => {
    webviewElement.insertCSS(scrollbarCSS).catch(error => {
      logMessage('error', `Failed to inject scrollbar CSS: ${error.message}`);
    });
  });
}

// Handle middle-click, right-click and new window events
function setupLinkHandlers(webviewElement) {
  // Prevent popups and capture new window requests
  webviewElement.setAttribute('allowpopups', '');
  
  // Handle new-window events directly
  webviewElement.addEventListener('new-window', (event) => {
    event.preventDefault();
    createTab(event.url);
    logMessage('info', `New window request intercepted: ${event.url} - opened in new tab`);
  });
  
  // Enhanced handling for right-click on links
  webviewElement.executeJavaScript(`
    (function() {
      // Handle right-click (button 2), middle-click (button 1), and ctrl+click (button 0 with ctrl key)
      document.addEventListener('mousedown', function(e) {
        if ((e.button === 2 || e.button === 1 || (e.button === 0 && e.ctrlKey)) && e.target.closest('a')) {
          e.preventDefault();
          e.stopPropagation();
          
          const link = e.target.closest('a');
          const url = link.href;
          
          if (url) {
            // Send message to be picked up by the preload script
            window.postMessage({ type: 'link-clicked', url: url }, '*');
          }
          
          return false;
        }
      }, true);
      
      // Prevent context menu on links
      document.addEventListener('contextmenu', function(e) {
        if (e.target.closest('a')) {
          e.preventDefault();
        }
      }, true);
      
      // Override window.open
      const originalWindowOpen = window.open;
      window.open = function(url) {
        if (url) {
          window.postMessage({ type: 'link-clicked', url: url }, '*');
          return null;
        }
        return originalWindowOpen.apply(this, arguments);
      };
    })();
  `);
  
  // Handle the message from the webview
  webviewElement.addEventListener('ipc-message', (event) => {
    if (event.channel === 'link-clicked' && event.args[0]) {
      createTab(event.args[0]);
      logMessage('info', `Link clicked: ${event.args[0]} - opened in new tab`);
    }
  });
}

// Show tabs viewport
function showTabsViewport() {
  tabsViewport.classList.add('active');
  document.body.classList.add('tabs-active');
  appContainer.classList.add('tabs-open');
  
  // Update URL input with current URL when showing tabs
  const activeWebview = document.querySelector('webview.active');
  if (activeWebview) {
    const currentUrl = activeWebview.getURL();
    urlInput.value = currentUrl;
    updateSecurityIndicator(currentUrl);
  }
  
  logMessage('info', 'Tab viewport opened');
}

// Hide tabs viewport
function hideTabsViewport() {
  tabsViewport.classList.remove('active');
  document.body.classList.remove('tabs-active');
  appContainer.classList.remove('tabs-open');
  
  // Clear URL suggestions
  urlSuggestions.innerHTML = '';
  urlSuggestions.classList.remove('has-suggestions');
  
  // Deactivate the search icon
  document.querySelector('.url-search-icon').classList.remove('active');
  
  logMessage('info', 'Tab viewport closed');
}

// Toggle tabs viewport
function toggleTabsViewport() {
  if (tabsViewport.classList.contains('active')) {
    hideTabsViewport();
  } else {
    showTabsViewport();
  }
}

// Hover Detection
let hoverTimer;
let tabsCloseTimer;

// Show tabs viewport on hover
tabsTriggerArea.addEventListener('mouseenter', () => {
  clearTimeout(tabsCloseTimer);
  hoverTimer = setTimeout(() => {
    showTabsViewport();
  }, 300);
});

tabsTriggerArea.addEventListener('mouseleave', () => {
  clearTimeout(hoverTimer);
});

tabsViewport.addEventListener('mouseleave', (e) => {
  // Check if we're not moving to the trigger area
  if (e.relatedTarget !== tabsTriggerArea) {
    tabsCloseTimer = setTimeout(() => {
      // Only auto-hide if URL input is not focused
      if (document.activeElement !== urlInput) {
        hideTabsViewport();
      }
    }, 500);
  }
});

// Prevent hover timer from closing viewport if mouse enters back
tabsViewport.addEventListener('mouseenter', () => {
  clearTimeout(tabsCloseTimer);
});

// Click outside to close viewports immediately
document.addEventListener('click', (e) => {
  if (tabsViewport.classList.contains('active') && 
      !tabsViewport.contains(e.target) && 
      !tabsTriggerArea.contains(e.target) &&
      e.target.id !== 'tabs-button') {
    hideTabsViewport();
  }
});

// Error handling
errorDismiss.addEventListener('click', () => {
  errorOverlay.classList.add('hidden');
});

// IPC event handlers
window.electronAPI.onDarkModeChanged((darkMode) => {
  settings.dark_mode = darkMode;
  applySettings();
});

window.electronAPI.onShowError((errorData) => {
  showError(errorData.title, errorData.message);
});

window.electronAPI.onSettingsUpdated((setting) => {
  if (setting === 'frameless') {
    showError('Restart Required', 'Please restart the application for the frameless mode change to take effect.');
  }
});

window.electronAPI.onCheckWebGL(() => {
  checkWebGL();
});

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  // Zoom controls: Ctrl+Plus and Ctrl+Minus
  if (event.ctrlKey) {
    // Ctrl+S to open URL viewport
    if (event.key === 's' || event.key === 'S') {
      showUrlViewport();
      event.preventDefault();
      return;
    }
    
    if (event.key === '=' || event.key === '+') {
      const newZoomFactor = Math.min(settings.zoom_factor + 0.1, 5.0);
      const activeWebview = document.querySelector('webview.active');
      if (activeWebview) {
        activeWebview.setZoomFactor(newZoomFactor);
      }
      window.electronAPI.updateZoom(newZoomFactor);
      settings.zoom_factor = newZoomFactor;
    } else if (event.key === '-') {
      const newZoomFactor = Math.max(settings.zoom_factor - 0.1, 0.25);
      const activeWebview = document.querySelector('webview.active');
      if (activeWebview) {
        activeWebview.setZoomFactor(newZoomFactor);
      }
      window.electronAPI.updateZoom(newZoomFactor);
      settings.zoom_factor = newZoomFactor;
    } else if (event.key === 't' || event.key === 'T') {
      // Ctrl+T to show tabs or create new tab
      if (tabsViewport.classList.contains('active')) {
        createTab();
      } else {
        showTabsViewport();
      }
      event.preventDefault();
    } else if (event.key === 'w' || event.key === 'W') {
      // Ctrl+W to close current tab
      if (tabs.length > 1) {
        closeTab(activeTabId);
        event.preventDefault();
      }
    }
  }
});

// Navigation button event listeners
const backButton = document.getElementById('back-button');
const forwardButton = document.getElementById('forward-button');
const closeButton = document.getElementById('close-button');
const tabsButton = document.getElementById('tabs-button');

backButton.addEventListener('click', () => {
  const activeWebview = document.querySelector('webview.active');
  if (activeWebview && activeWebview.canGoBack()) {
    activeWebview.goBack();
    logMessage('info', 'Navigating back');
  }
});

forwardButton.addEventListener('click', () => {
  const activeWebview = document.querySelector('webview.active');
  if (activeWebview && activeWebview.canGoForward()) {
    activeWebview.goForward();
    logMessage('info', 'Navigating forward');
  }
});

closeButton.addEventListener('click', () => {
  logMessage('info', 'Close button clicked');
  window.electronAPI.closeApp();
});

tabsButton.addEventListener('click', () => {
  const activeWebview = document.querySelector('webview.active');
  if (activeWebview) {
    activeWebview.reload();
    logMessage('info', 'Reloading page');
  }
});

// Model status checking removed



// Update navigation button states for active webview
function updateNavigationButtons() {
  const activeWebview = document.querySelector('webview.active');
  if (activeWebview) {
    backButton.disabled = !activeWebview.canGoBack();
    forwardButton.disabled = !activeWebview.canGoForward();
  }
}

// Add listeners for updates to navigation button states
document.querySelectorAll('webview').forEach(webview => {
  webview.addEventListener('did-navigate', () => {
    if (webview.classList.contains('active')) {
      updateNavigationButtons();
    }
  });

  webview.addEventListener('did-navigate-in-page', () => {
    if (webview.classList.contains('active')) {
      updateNavigationButtons();
    }
  });
});

// Focus URL input in the combined Tab viewport
function focusUrlInput() {
  // Show the tabs viewport if not already active
  if (!tabsViewport.classList.contains('active')) {
    showTabsViewport();
  }
  
  // Add enhanced security indicator styling
  tabsViewport.classList.add('enhanced-security');
  
  // Focus and select the input
  setTimeout(() => {
    urlInput.focus();
    // Pre-fill with current URL if available
    const activeWebview = document.querySelector('webview.active');
    if (activeWebview) {
      const currentUrl = activeWebview.getURL();
      urlInput.value = currentUrl;
      urlInput.select();
      
      // Update security indicator based on current URL
      updateSecurityIndicator(currentUrl);
    }
    
    // Activate the search icon
    document.querySelector('.url-search-icon').classList.add('active');
  }, 50); // Short delay to ensure CSS transitions are complete
  
  // Ensure the search engine icon is correctly displayed
  updateSearchEngineUI();
  
  logMessage('info', 'URL input focused');
}

function clearUrlInput() {
  // Clear suggestions
  urlSuggestions.innerHTML = '';
  urlSuggestions.classList.remove('has-suggestions');
  
  // Clear input
  urlInput.value = '';
  
  // Deactivate the search icon
  document.querySelector('.url-search-icon').classList.remove('active');
  
  logMessage('info', 'URL input cleared');
}

function toggleUrlInput() {
  // Show tabs viewport and focus URL input
  focusUrlInput();
}

function updateUrlInput(url) {
  if (!url) return;
  
  try {
    // Store current URL
    currentUrl = url;
    
    // Update the input if visible
    if (urlViewport.classList.contains('active')) {
      urlInput.value = url;
    }
  } catch (error) {
    logMessage('error', `Failed to update URL input: ${error.message}`);
  }
}

// Security indicator for URL viewport
function updateSecurityIndicator(url) {
  if (!securityIndicator) return;
  
  // Reset classes
  securityIndicator.classList.remove('secure', 'not-secure', 'warning');
  
  try {
    // Parse the URL
    const urlObj = new URL(url);
    
    if (urlObj.protocol === 'https:') {
      // Secure connection
      securityIndicator.classList.add('secure');
      securityIndicator.innerHTML = '<i class="fas fa-lock"></i>';
      // Add a title for hover tooltip
      securityIndicator.title = `Secure connection to ${urlObj.hostname}`;
      logMessage('info', `Secure connection to ${urlObj.hostname}`);
    } else if (urlObj.protocol === 'http:') {
      // Not secure
      securityIndicator.classList.add('not-secure');
      securityIndicator.innerHTML = '<i class="fas fa-lock-open"></i>';
      securityIndicator.title = `Insecure connection to ${urlObj.hostname}`;
      logMessage('info', `Insecure connection to ${urlObj.hostname}`);
    } else if (urlObj.protocol === 'file:') {
      // Local file
      securityIndicator.classList.add('secure');
      securityIndicator.innerHTML = '<i class="fas fa-file"></i>';
      securityIndicator.title = 'Local file (secure)';
      logMessage('info', 'Local file access');
    } else {
      // Other protocol
      securityIndicator.classList.add('warning');
      securityIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
      securityIndicator.title = `${urlObj.protocol} protocol - use caution`;
      logMessage('info', `Protocol ${urlObj.protocol} for ${urlObj.hostname}`);
    }
  } catch (error) {
    // Invalid URL
    securityIndicator.classList.add('warning');
    securityIndicator.innerHTML = '<i class="fas fa-question-circle"></i>';
    securityIndicator.title = 'Invalid URL format';
    logMessage('warn', `Invalid URL format: ${error.message}`);
  }
}

// Loading strip animation functions
let loadingTimeout;
let loadingInterval;

// Start loading animation
function startLoadingAnimation() {
  if (loadingStrip) {
    // Clear any existing timeouts and intervals
    clearTimeout(loadingTimeout);
    clearInterval(loadingInterval);
    
    // Reset and show loading strip
    loadingStrip.className = '';
    loadingStrip.classList.add('active');
    loadingStrip.classList.add('indeterminate');
    
    // Add hidden accessibility text for screen readers
    const progressText = document.createElement('div');
    progressText.className = 'loading-progress-text';
    progressText.setAttribute('aria-live', 'polite');
    progressText.textContent = 'Page loading started';
    loadingStrip.appendChild(progressText);
    
    // Start with initial progress after a short delay
    loadingTimeout = setTimeout(() => {
      updateLoadingProgress(25);
    }, 300);
    
    logMessage('info', 'Loading animation started');
  }
}

// Update loading progress
function updateLoadingProgress(progress) {
  if (loadingStrip) {
    // Remove all previous classes except 'active'
    loadingStrip.className = '';
    loadingStrip.classList.add('active');
    loadingStrip.classList.add(`progress-${progress}`);
    
    // Update the progress text for screen readers
    const progressText = loadingStrip.querySelector('.loading-progress-text');
    if (progressText) {
      progressText.textContent = `Page loading: ${progress}%`;
    }
    
    // For performance, only log every 25% increments
    if (progress % 25 === 0) {
      logMessage('info', `Loading progress: ${progress}%`);
    }
  }
}

// Complete loading animation
function completeLoadingAnimation() {
  if (loadingStrip) {
    // Clear any existing timeouts and intervals
    clearTimeout(loadingTimeout);
    clearInterval(loadingInterval);
    
    // Apply 'complete' animation
    loadingStrip.classList.remove('indeterminate');
    loadingStrip.classList.add('complete');
    
    // Update accessibility text
    const progressText = loadingStrip.querySelector('.loading-progress-text');
    if (progressText) {
      progressText.textContent = 'Page loading complete';
    }
    
    // Reset strip completely after animation ends
    loadingTimeout = setTimeout(() => {
      loadingStrip.className = '';
      // Remove progress text element when done
      if (progressText) progressText.remove();
    }, 600);
    
    logMessage('info', 'Loading animation completed');
  }
}

async function getDNSPredictions(query) {
  if (!query || query.trim() === '') {
    urlSuggestions.innerHTML = '';
    return;
  }
  
  try {
    const predictions = await window.electronAPI.getDNSPredictions(query);
    urlSuggestionResults = predictions;
    updateUrlSuggestions();
  } catch (error) {
    logMessage('error', `Error getting predictions: ${error.message}`);
  }
}

function updateUrlSuggestions() {
  urlSuggestions.innerHTML = '';
  
  if (urlSuggestionResults.length === 0) {
    urlSuggestions.classList.remove('has-suggestions');
    return;
  }
  
  // Show suggestions container
  urlSuggestions.classList.add('has-suggestions');
  
  urlSuggestionResults.forEach((suggestion, index) => {
    const suggestionItem = document.createElement('div');
    suggestionItem.className = 'url-suggestion-item';
    suggestionItem.dataset.index = index;
    
    const iconElement = document.createElement('div');
    iconElement.className = 'url-suggestion-icon';
    
    // Set the appropriate icon
    if (suggestion.type === 'url') {
      iconElement.innerHTML = '<i class="fas fa-globe"></i>';
    } else if (suggestion.type === 'search') {
      iconElement.innerHTML = '<i class="fas fa-search"></i>';
    }
    
    const textElement = document.createElement('div');
    textElement.className = 'url-suggestion-text';
    textElement.textContent = suggestion.text;
    
    const detailElement = document.createElement('div');
    detailElement.className = 'url-suggestion-detail';
    
    if (suggestion.type === 'url') {
      detailElement.textContent = 'Visit';
    } else if (suggestion.type === 'search') {
      detailElement.textContent = `Search with ${suggestion.engine}`;
    }
    
    suggestionItem.appendChild(iconElement);
    suggestionItem.appendChild(textElement);
    suggestionItem.appendChild(detailElement);
    
    suggestionItem.addEventListener('click', () => {
      selectSuggestion(index);
    });
    
    urlSuggestions.appendChild(suggestionItem);
  });
}

function selectSuggestion(index) {
  const suggestion = urlSuggestionResults[index];
  if (!suggestion) return;
  
  if (suggestion.type === 'url') {
    navigateToUrl(suggestion.url);
  } else if (suggestion.type === 'search') {
    const searchUrl = `${settings.search_engine.url}${encodeURIComponent(suggestion.text)}`;
    navigateToUrl(searchUrl);
  }
  
  hideUrlViewport();
}

function navigateToUrl(url) {
  const activeWebview = document.querySelector('webview.active');
  if (activeWebview) {
    activeWebview.src = url;
    logMessage('info', `Navigating to: ${url}`);
  } else {
    // Create a new tab if no active webview
    createTab(url);
  }
}

function processUrlInput() {
  const inputValue = urlInput.value.trim();
  if (!inputValue) return;
  
  // Check if it's a valid URL
  let url = inputValue;
  
  // If it contains spaces, treat as search
  if (inputValue.includes(' ')) {
    url = `${settings.search_engine.url}${encodeURIComponent(inputValue)}`;
    logMessage('info', `Searching for "${inputValue}" with ${settings.search_engine.name}`);
  } 
  // If it looks like a domain with TLD but no protocol
  else if (!inputValue.startsWith('http') && 
           !inputValue.startsWith('file:') && 
           /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/.test(inputValue)) {
    url = `https://${inputValue}`;
    logMessage('info', `Adding https protocol to ${inputValue}`);
  }
  // If it might be an intranet address or localhost
  else if (!inputValue.startsWith('http') && 
           !inputValue.startsWith('file:') && 
           !inputValue.includes(' ') && 
           (inputValue.includes('.') || inputValue === 'localhost')) {
    url = `http://${inputValue}`;
    logMessage('info', `Adding http protocol to ${inputValue}`);
  }
  // Otherwise, search for it
  else if (!inputValue.startsWith('http') && !inputValue.startsWith('file:')) {
    url = `${settings.search_engine.url}${encodeURIComponent(inputValue)}`;
    logMessage('info', `Searching for "${inputValue}" with ${settings.search_engine.name}`);
  }
  
  navigateToUrl(url);
  hideUrlViewport();
}

// Update search engine UI using favicons
async function updateSearchEngineUI() {
  // Reset button content
  searchEngineButton.innerHTML = '';
  
  // Create image favicon element
  const img = document.createElement('img');
  img.src = settings.search_engine.favicon || 'https://www.google.com/favicon.ico';
  img.alt = settings.search_engine.name;
  img.className = 'search-engine-favicon';
  img.style.width = '14px';
  img.style.height = '14px';
  img.style.borderRadius = '50%';
  
  // Append the image to the button
  searchEngineButton.appendChild(img);
  
  // Style the button container properly
  searchEngineButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
  searchEngineButton.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
  searchEngineButton.style.display = 'flex';
  searchEngineButton.style.alignItems = 'center';
  searchEngineButton.style.justifyContent = 'center';
  
  // Add title for accessibility
  searchEngineButton.title = `Search with ${settings.search_engine.name}`;
  
  // Style the search engine items in the selector
  document.querySelectorAll('.search-engine-item').forEach(item => {
    // Check if this is the active engine
    const isActive = item.getAttribute('data-engine') === settings.search_engine.name;
    
    // Highlight active item
    item.classList.toggle('active', isActive);
    
    // Show/hide the checkmark
    const checkmark = item.querySelector('.search-engine-selected');
    if (checkmark) {
      checkmark.style.display = isActive ? 'flex' : 'none';
    }
  });
  
  // Save the setting
  window.electronAPI.saveSettings({
    search_engine: settings.search_engine
  });
  
  // Add event listener to the search engine button if not already added
  if (!searchEngineButton._hasClickListener) {
    searchEngineButton.addEventListener('click', () => {
      showSearchEngineSelector();
    });
    searchEngineButton._hasClickListener = true;
  }
  
  logMessage('info', `Current search engine: ${settings.search_engine.name}`);
}

async function setSearchEngine(name, url, icon) {
  // Get the favicon URL from the data attribute
  const engineItem = document.querySelector(`.search-engine-item[data-engine="${name}"]`);
  let faviconUrl = '';
  
  if (engineItem) {
    faviconUrl = engineItem.getAttribute('data-favicon') || '';
  }
  
  // Update the search engine settings with the favicon URL
  settings.search_engine = { 
    name, 
    url, 
    favicon: faviconUrl 
  };
  
  // Save to electron settings
  await window.electronAPI.saveSearchEngine(settings.search_engine);
  
  // Update the UI
  updateSearchEngineUI();
  hideSearchEngineSelector();
  
  // Show a notification
  showNotification('Search Engine Changed', `Now searching with ${name}`, 'info');
}

function showSearchEngineSelector() {
  searchEngineSelector.classList.add('active');
}

function hideSearchEngineSelector() {
  searchEngineSelector.classList.remove('active');
}

function setupUrlInputEvents() {
  // Global keyboard shortcuts for URL input and tabs
  document.addEventListener('keydown', (event) => {
    // Ctrl+S to focus URL input in tab viewport
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault(); // Prevent browser save dialog
      focusUrlInput();
      return;
    }

    // Handle keyboard events when Tab viewport is active
    if (tabsViewport.classList.contains('active')) {
      // Enter to process URL when focus is in URL input
      if (event.key === 'Enter' && document.activeElement === urlInput) {
        processUrlInput();
        event.preventDefault();
      }
      
      // Escape to hide tab viewport or clear URL input
      if (event.key === 'Escape') {
        if (document.activeElement === urlInput) {
          // If URL input is focused, blur it first
          urlInput.blur();
        } else {
          // Otherwise hide the tab viewport
          hideTabsViewport();
        }
        event.preventDefault();
      }
      
      // Up/Down arrow keys to navigate suggestions when URL input is focused
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && document.activeElement === urlInput) {
        navigateSuggestions(event.key === 'ArrowDown' ? 1 : -1);
        event.preventDefault();
      }
    }
  });
  
  // URL input changes with debounce for better performance
  urlInput.addEventListener('input', () => {
    // Show the search icon when typing
    document.querySelector('.url-search-icon').classList.add('active');
    
    // Clear previous timeout to implement debouncing
    clearTimeout(searchTimeout);
    
    // Set new timeout for predictions
    searchTimeout = setTimeout(() => {
      getDNSPredictions(urlInput.value);
    }, 250); // Reduced from 300ms for faster response
  });
  
  // Focus event for URL input
  urlInput.addEventListener('focus', () => {
    // Show suggestions if there are any
    if (urlSuggestionResults.length > 0) {
      updateUrlSuggestions();
    }
  });
  
  // Click outside to close search engine selector
  document.addEventListener('click', (event) => {
    // Close search engine selector if clicking outside
    if (searchEngineSelector.classList.contains('active') && 
        !searchEngineSelector.contains(event.target) && 
        !searchEngineButton.contains(event.target)) {
      hideSearchEngineSelector();
    }
  });
  
  // Search engine button
  searchEngineButton.addEventListener('click', (event) => {
    event.stopPropagation();
    showSearchEngineSelector();
  });
  
  // Search engine selector items
  const searchEngineItems = document.querySelectorAll('.search-engine-item');
  searchEngineItems.forEach(item => {
    item.addEventListener('click', () => {
      const engine = item.getAttribute('data-engine');
      const url = item.getAttribute('data-url');
      const icon = item.getAttribute('data-icon');
      setSearchEngine(engine, url, icon);
    });
  });
  
  // Mobile-friendly touch events for URL suggestions
  urlSuggestions.addEventListener('touchstart', handleTouchStart, false);
  urlSuggestions.addEventListener('touchmove', handleTouchMove, false);
}

// Track suggestion navigation
let currentSuggestionIndex = -1;

// Navigate through suggestions with keyboard
function navigateSuggestions(direction) {
  const suggestions = document.querySelectorAll('.url-suggestion-item');
  if (suggestions.length === 0) return;
  
  // Remove highlight from current suggestion
  if (currentSuggestionIndex >= 0 && currentSuggestionIndex < suggestions.length) {
    suggestions[currentSuggestionIndex].classList.remove('highlighted');
  }
  
  // Calculate new index with wrapping
  currentSuggestionIndex += direction;
  if (currentSuggestionIndex < 0) currentSuggestionIndex = suggestions.length - 1;
  if (currentSuggestionIndex >= suggestions.length) currentSuggestionIndex = 0;
  
  // Highlight new selection
  const selectedSuggestion = suggestions[currentSuggestionIndex];
  selectedSuggestion.classList.add('highlighted');
  
  // Ensure the selected item is visible
  selectedSuggestion.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  
  // Update input field with the selected suggestion
  const suggestionText = selectedSuggestion.querySelector('.url-suggestion-text').textContent;
  urlInput.value = suggestionText;
}

// Touch support for URL suggestions
let touchStartY = 0;

function handleTouchStart(evt) {
  touchStartY = evt.touches[0].clientY;
}

function handleTouchMove(evt) {
  if (!touchStartY) return;
  
  const touchY = evt.touches[0].clientY;
  const diff = touchStartY - touchY;
  
  // If the user is scrolling the suggestions, prevent page scroll
  if (Math.abs(diff) > 5) {
    evt.preventDefault();
  }
  
  touchStartY = null;
}

// Update status listener
window.electronAPI.onUpdateStatus((status, data) => {
  let statusMessage = '';
  switch (status) {
    case 'checking':
      statusMessage = 'Checking for updates...';
      showNotification('Checking for Updates', 'Looking for new versions...', 'info');
      break;
    case 'available':
      statusMessage = `Update available: ${data?.version || 'newer version'}`;
      showNotification('Update Available', `Version ${data?.version || 'newer version'} is available and will be downloaded automatically.`, 'success');
      break;
    case 'not-available':
      statusMessage = 'You are using the latest version.';
      showNotification('No Updates', 'You are using the latest version of Nuru Browser.', 'info');
      break;
    case 'error':
      statusMessage = `Update error: ${data || 'unknown error'}`;
      showNotification('Update Error', `Failed to check for updates: ${data || 'unknown error'}`, 'error');
      break;
    case 'downloaded':
      statusMessage = 'Update downloaded, will install on restart.';
      showNotification('Update Ready', 'Update has been downloaded. It will be installed when you restart the application.', 'success');
      break;
    case 'disabled-dev':
      statusMessage = 'Updates disabled in development mode.';
      showNotification('Dev Mode', 'Auto-updates are disabled in development mode.', 'warning');
      break;
    case 'progress':
      if (data && data.percent) {
        statusMessage = `Downloading update: ${Math.round(data.percent)}%`;
      }
      break;
    default:
      statusMessage = status;
  }
  
  logMessage('info', `Update status: ${statusMessage}`);
});

// Browser action button event listeners
updateCheckBtn?.addEventListener('click', () => {
  window.electronAPI.checkForUpdates();
  showNotification('Update Check', 'Checking for available updates...', 'info');
});

diagnosticsBtn?.addEventListener('click', () => {
  window.electronAPI.showDiagnostics();
  showNotification('Diagnostics', 'Opening diagnostics window...', 'info');
});

// Initialize
loadSettings();
initializeTabs();
setupUrlInputEvents();

// Log startup
logMessage('info', 'Renderer process started');
