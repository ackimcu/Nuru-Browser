// Override console.error to suppress guest view abort messages
(() => {
  const _origError = console.error;
  console.error = (...args) => {
    // Combine all args into string for filtering
    const text = args.map(a => a && a.toString()).join(' ');
    // Suppress internal guest load abort messages
    if (text.includes('Unexpected error while loading URL') && text.includes('ERR_ABORTED')) return;
    _origError.apply(console, args);
  };
})();

// Suppress Electron Guest View aborted-load errors
window.addEventListener('error', e => {
  if (e.message && e.message.includes('GUEST_VIEW_MANAGER_CALL') && e.message.includes('ERR_ABORTED')) {
    e.preventDefault();
  }
});

// Suppress unhandled promise rejections for guest-load aborts
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason && (e.reason.message || e.reason.toString());
  if (msg && msg.includes('GUEST_VIEW_MANAGER_CALL') && msg.includes('ERR_ABORTED')) {
    e.preventDefault();
  }
});

// DOM Elements
const webviewsContainer = document.getElementById('webviews-container');
// Generic stub element to avoid missing element errors
const noopElem = { classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} }, addEventListener: () => {}, removeEventListener: () => {}, appendChild: () => {}, style: {}, _hasClickListener: false };

const activeWebview = document.getElementById('webview-0');
const tabsList = document.getElementById('tabs-list');
const tabsViewport = document.querySelector('.tabs-viewport');
const tabsTriggerArea = document.querySelector('.tabs-trigger-area');
const appContainer = document.getElementById('app');
const loadingStrip = document.getElementById('loading-strip');
const errorOverlay = document.getElementById('error-overlay');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const updateCheckBtn = document.getElementById('update-check-btn');
const diagnosticsBtn = document.getElementById('diagnostics-btn');
const historyTriggerArea = document.querySelector('.history-trigger-area');
const historyViewport = document.querySelector('.history-viewport');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// Nuru Selects functionality
const mediaSelect = document.getElementById('media-select');
const resourceList = document.getElementById('resource-list');
const addResourceBtn = document.getElementById('add-resource-btn');
const addResourceForm = document.getElementById('add-resource-form');
const newResourceName = document.getElementById('new-resource-name');
const newResourceUrl = document.getElementById('new-resource-url');
const newResourceCategory = document.getElementById('new-resource-category');
const saveResourceBtn = document.getElementById('save-resource-btn');
const cancelResourceBtn = document.getElementById('cancel-resource-btn');
let resources = {};

function initResources() {
  const stored = localStorage.getItem('nuruResources');
  if (stored) resources = JSON.parse(stored);
  else {
    resources = {
      Movies: [{ name: 'IMDb', url: 'https://www.imdb.com' }],
      Music: [{ name: 'Spotify', url: 'https://www.spotify.com' }],
      Adult: [{ name: 'Example Adult', url: 'https://example.com' }]
    };
    localStorage.setItem('nuruResources', JSON.stringify(resources));
  }
}

function renderResources(category) {
  resourceList.innerHTML = '';
  (resources[category] || []).forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'resource-item';
    const linkSpan = document.createElement('span');
    linkSpan.className = 'resource-link';
    linkSpan.textContent = item.name;
    linkSpan.addEventListener('click', () => navigateToUrl(item.url));
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-resource-btn';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.addEventListener('click', e => {
      e.stopPropagation();
      resources[category].splice(idx, 1);
      saveResources();
      renderResources(category);
    });
    div.appendChild(linkSpan);
    div.appendChild(deleteBtn);
    resourceList.appendChild(div);
  });
}

function saveResources() {
  localStorage.setItem('nuruResources', JSON.stringify(resources));
}

// Event bindings
mediaSelect.addEventListener('change', () => renderResources(mediaSelect.value));
addResourceBtn.addEventListener('click', () => addResourceForm.classList.remove('hidden'));
cancelResourceBtn.addEventListener('click', () => addResourceForm.classList.add('hidden'));

// Autofill resource fields from active webview
const addWebsiteBtn = document.getElementById('add-website-btn');
addWebsiteBtn.addEventListener('click', () => {
  const webview = document.querySelector('webview.active');
  if (webview) {
    const url = webview.getURL();
    const name = webview.getTitle();
    newResourceUrl.value = url;
    newResourceName.value = name;
    addResourceForm.classList.remove('hidden');
  }
});

saveResourceBtn.addEventListener('click', () => {
  const name = newResourceName.value.trim();
  const url = newResourceUrl.value.trim();
  const cat = newResourceCategory.value;
  if (name && url) {
    resources[cat].push({ name, url });
    saveResources();
    renderResources(mediaSelect.value);
    addResourceForm.classList.add('hidden');
    newResourceName.value = '';
    newResourceUrl.value = '';
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  // Load settings then init UI
  await loadSettings();
  initResources();
  renderResources(mediaSelect.value);
  initializeTabs();
  // Initialize Reading Mode button
  readingBtn = document.getElementById('reading-mode-btn');
  if (readingBtn) {
    updateReadingMode();
    readingBtn.addEventListener('click', () => {
      const activeView = document.querySelector('webview.active');
      if (activeView) {
        activeView.executeJavaScript('(' + __nuruInjectReadingMode.toString() + ')()')
          .catch(err => console.error('Reading mode injection failed:', err));
      }
    });
  }
  updateReadingMode();

  // --- Reading Mode Detection & Notification ---
  function detectArticlePage(webview) {
    if (!webview) return;
    webview.executeJavaScript(`!!document.querySelector('article, main')`).then(isArticle => {
      const btn = document.getElementById('reading-mode-btn');
      if (btn) {
        if (isArticle) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
      }
    });
  }

  // Update reading-mode icon visibility for active webview
  function updateReadingMode() {
    const activeView = document.querySelector('webview.active');
    detectArticlePage(activeView);
  }

  // Listen for navigation events to detect article pages
  document.querySelectorAll('webview').forEach(webview => {
    webview.addEventListener('did-navigate', () => detectArticlePage(webview));
    webview.addEventListener('did-navigate-in-page', () => detectArticlePage(webview));
    webview.addEventListener('dom-ready', () => detectArticlePage(webview));
  });

  // Existing context menu and modal logic
  if (window.electronAPI && window.electronAPI.onContextMenuNewTab) {
    window.electronAPI.onContextMenuNewTab((url) => {
      // Create tab lazily without activating
      createTab(url, false);
      updateTabsUI();
    });
  }
  // Setup Nuru Selects modal
  const selectsOverlay = document.getElementById('selects-modal-overlay');
  const btnSelectClose = document.getElementById('selects-close');

  function toggleSelectsModal() {
    if (selectsOverlay) selectsOverlay.style.display = selectsOverlay.style.display === 'flex' ? 'none' : 'flex';
  }
  // Keyboard shortcuts: Ctrl+B for selects, Ctrl+D for diagnostics
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'b') toggleSelectsModal();
    if (e.ctrlKey && e.key.toLowerCase() === 'd') window.electronAPI.showDiagnostics();
  });
  // Context menu for selects
  if (window.electronAPI && window.electronAPI.onToggleSelectsModal) {
    window.electronAPI.onToggleSelectsModal(toggleSelectsModal);
  }
  // Close button
  if (btnSelectClose) btnSelectClose.addEventListener('click', toggleSelectsModal);
});

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

function updateUrlInput(url) {
  currentUrl = url;
  if (modernInput && modernInput !== document.activeElement) {
    modernInput.value = getShortUrl(url);
  } else if (modernInput) {
    modernInput.value = url;
  }
}

// Modern search bar logic
const modernInput = document.getElementById('modern-search-input');
modernInput.addEventListener('click', () => {
  modernInput.select();
  updateSuggestions(modernInput.value);
});
const suggestionsBox = document.getElementById('modern-suggestions');

// Home button logic
document.addEventListener('DOMContentLoaded', () => {
  const btnHome = document.getElementById('home-btn');
  if (btnHome) {
    btnHome.addEventListener('click', () => {
      if (settings && settings.homepage && settings.homepage.trim()) {
        navigateToUrl(settings.homepage.trim());
      } else if (typeof showNotification === 'function') {
        showNotification('No homepage set in settings.', true);
      }
    });
  }
});

const searchBar = document.getElementById('modern-search-bar');

// Persistent search history via localStorage
const HISTORY_KEY = 'searchHistory';
let history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];

let filtered = [], highlightedIdx = -1;

/**
 * Shift tabs list down/up based on suggestions dropdown visibility
 */
function adjustTabs(active) {
  const header = document.querySelector('.tabs-list-header');
  const list = document.getElementById('tabs-list');
  if (active) {
    const h = suggestionsBox.getBoundingClientRect().height;
    header.style.transform = `translateY(${h}px)`;
    list.style.transform = `translateY(${h}px)`;
  } else {
    header.style.transform = '';
    list.style.transform = '';
  }
}

function updateSuggestions(val) {
  console.log('[Suggestions] updateSuggestions called with:', val);
  // Show all history entries matching val (includes all when val is empty)
  filtered = history.filter(s => s.toLowerCase().includes(val.toLowerCase()));
  if (!filtered.length) {
    suggestionsBox.classList.remove('open');
    suggestionsBox.innerHTML = '';
    adjustTabs(false);
    return;
  }
  suggestionsBox.classList.add('open');
  suggestionsBox.innerHTML = `<li class="suggest-header">Latest searches</li>` + filtered.map((s, i) => {
    // Highlight match
    const idx = s.toLowerCase().indexOf(val.toLowerCase());
    let display = idx >= 0 ?
      s.slice(0, idx) + '<span class="matched">' + s.slice(idx, idx + val.length) + '</span>' + s.slice(idx + val.length) :
      s;
    // append .com to suggestions
    return `<li class="${i === highlightedIdx ? 'highlighted' : ''}" data-idx="${i}"><span class="suggest-icon"><i class="fas fa-search"></i></span><span class="suggest-text">${display}.com</span><button class="suggest-delete" data-idx="${i}">&times;</button></li>`;
  }).join('');
  suggestionsBox.classList.add('open');
  adjustTabs(true);
}

modernInput.addEventListener('input', e => {
  highlightedIdx = -1;
  updateSuggestions(e.target.value);
});

modernInput.addEventListener('keydown', e => {
  if (filtered.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    if (e.key === 'ArrowDown') {
      highlightedIdx = (highlightedIdx + 1) % filtered.length;
      updateSuggestions(modernInput.value);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      highlightedIdx = (highlightedIdx - 1 + filtered.length) % filtered.length;
      updateSuggestions(modernInput.value);
      e.preventDefault();
    }
  } else if (e.key === 'Enter') {
    if (highlightedIdx >= 0 && filtered.length) {
      modernInput.value = filtered[highlightedIdx];
      triggerSearch(filtered[highlightedIdx]);
    } else {
      triggerSearch(modernInput.value);
    }
    suggestionsBox.classList.remove('open');
    highlightedIdx = -1;
    adjustTabs(false);
    e.preventDefault();
  } else if (e.key === 'Escape') {
    suggestionsBox.classList.remove('open');
    highlightedIdx = -1;
    adjustTabs(false);
  }
});

suggestionsBox.addEventListener('mousedown', e => {
  // ignore delete button clicks
  if (e.target.classList.contains('suggest-delete')) return;
  const li = e.target.closest('li[data-idx]');
  if (li) {
    const idx = parseInt(li.getAttribute('data-idx'));
    modernInput.value = filtered[idx];
    suggestionsBox.classList.remove('open');
    highlightedIdx = -1;
    adjustTabs(false);
    triggerSearch(filtered[idx]);
  }
});

// Delete suggestion
suggestionsBox.addEventListener('click', e => {
  if (e.target.classList.contains('suggest-delete')) {
    const idx = parseInt(e.target.getAttribute('data-idx'));
    history.splice(idx, 1);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    updateSuggestions(modernInput.value);
    e.stopPropagation();
  }
});

// Hide suggestions on blur (with delay for click)
modernInput.addEventListener('blur', () => setTimeout(() => {
  suggestionsBox.classList.remove('open');
  highlightedIdx = -1;
  adjustTabs(false);
}, 120));

// Show suggestions on focus if input has value
modernInput.addEventListener('focus', () => {
  if (modernInput.value) updateSuggestions(modernInput.value);
});

// URL helper for shortened display
let currentUrl = '';
function getShortUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

modernInput.addEventListener('focus', () => {
  if (currentUrl) {
    modernInput.value = currentUrl;
    modernInput.select();
  }
});
modernInput.addEventListener('blur', () => {
  setTimeout(() => {
    modernInput.value = getShortUrl(currentUrl);
  }, 0);
});

function triggerSearch(q) {
  if (!q) return;
  // Replace this with your real navigation/search logic
  window.navigateToUrl ? window.navigateToUrl(`https://www.google.com/search?q=${encodeURIComponent(q)}`) : window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
  // Save search query to history
  if (!history.includes(q)) history.push(q);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// Fancy icon highlight
searchBar.querySelector('.mic-icon').addEventListener('mousedown', () => {
  searchBar.querySelector('.mic-icon').classList.add('active');
  // Optionally: trigger voice search
});
searchBar.querySelector('.mic-icon').addEventListener('mouseup', () => {
  searchBar.querySelector('.mic-icon').classList.remove('active');
});

// Settings
let settings = {
  frameless: true,
  zoom_factor: 1.5,
  restoreLastPage: true,
};

// Tab management
let tabs = [];
let activeTabId = 'webview-0';
let tabCounter = 1; // Start at 1 since webview-0 is already created

// History management
let historyData = JSON.parse(localStorage.getItem('historyData') || '[]');
let historyHoverTimer, historyCloseTimer;

function saveHistory() {
  localStorage.setItem('historyData', JSON.stringify(historyData));
}

function renderHistory() {
  historyList.innerHTML = historyData.map((item, idx) => {
    const date = new Date(item.timestamp);
    const formatted = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    return `
      <div class="history-item" data-index="${idx}">
        <div class="history-title">${item.title}</div>
        <div class="history-meta">${formatted}</div>
        <div class="history-item-close" data-index="${idx}"><i class="fas fa-times"></i></div>
      </div>
    `;
  }).join('');
}

function addHistoryEntry(webview) {
  const url = webview.getURL();
  const title = webview.getTitle() || url;
  historyData = historyData.filter(item => item.url !== url);
  historyData.unshift({ url, title, timestamp: Date.now() });
  saveHistory();
  renderHistory();
}

// Load settings on startup
async function loadSettings() {
  try {
    const loadedSettings = await window.electronAPI.getSettings();
    if (loadedSettings) {
      settings = loadedSettings;
      applySettings();
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
  // Dark mode feature removed
  // Only apply zoom factor if the active webview is loaded
  if (activeWebview && typeof activeWebview.getWebContentsId === 'function') {
    try {
      activeWebview.setZoomFactor(settings.zoom_factor);
    } catch (error) {
      console.log('Zoom will be applied when webview is ready');
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

// Notification utility to replace overlays
function showNotification(type, title, message, timeout = 5000) {
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.innerHTML = `<div class="notification-title">${title}</div><div class="notification-message">${message}</div>`;
  document.body.appendChild(notif);
  requestAnimationFrame(() => notif.classList.add('show'));
  setTimeout(() => {
    notif.classList.remove('show');
    notif.addEventListener('transitionend', () => notif.remove());
  }, timeout);
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
  const defaultURL = 'https://www.google.com/';
  // Determine URL based on restoreLastPage setting
  const lastPage = settings.restoreLastPage
    ? (localStorage.getItem('lastPage') || defaultURL)
    : defaultURL;
  // Add the initial tab to the tabs array
  tabs.push({ id: 'webview-0', title: lastPage, url: lastPage, favicon: null });
  // Update the initial webview src
  activeWebview.setAttribute('src', lastPage);
  updateUrlInput(lastPage);
  // Render UI and bind events
  updateTabsUI();
  setupWebviewEvents(activeWebview);
}

// Create a new tab
function createTab(url = 'https://www.google.com/', activate = true) {
  const tabId = `webview-${tabCounter++}`;
  
  // Create the webview element
  const newWebview = document.createElement('webview');
  newWebview.id = tabId;
  // Lazy-load: store URL but do not load until activated
  newWebview.dataset.src = url;
  newWebview.setAttribute('allowpopups', '');
  newWebview.setAttribute('partition', 'persist:browsing');
  newWebview.setAttribute('webpreferences', 'allowRunningInsecureContent=yes, javascript=yes');
  newWebview.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');
  
  // Add it to the DOM
  webviewsContainer.appendChild(newWebview);
  
  // Don't auto-start loading; defer until activation for lazy-load
  
  // Add to tabs array
  tabs.push({
    id: tabId,
    title: url,
    url: url,
    favicon: null,
    createdAt: Date.now()
  });
  
  // If lazily created, prefetch title and icon
  if (!activate) {
    prefetchTitle(url, tabId);
  }
  
  // Setup event listeners
  setupWebviewEvents(newWebview);
  
  // Activate the tab if requested
  if (activate) switchToTab(tabId);
  
  logMessage('info', `Created new tab with ID: ${tabId}`);
  
  return tabId;
}

/**
 * Fetch page title for unloaded tabs
 */
function prefetchTitle(url, tabId) {
  fetch(url)
    .then(res => res.text())
    .then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const titleText = doc.querySelector('title')?.textContent.trim() || url;
      const tab = tabs.find(t => t.id === tabId);
      if (tab) {
        tab.title = titleText;
        updateTabsUI();
      }
    })
    .catch(() => {});
}

// Switch to a specific tab
function switchToTab(tabId) {
  // Fully reset/hide media progress when switching tabs
  // Hide all webviews
  document.querySelectorAll('webview').forEach(webview => {
    webview.classList.remove('active');
  });
  
  // Show the selected webview
  const selectedWebview = document.getElementById(tabId);
  if (selectedWebview) {
    // Lazy-load URL when the tab is first activated
    if (selectedWebview.dataset.src) {
      const loadUrl = selectedWebview.dataset.src;
      // Trigger the webview to load the URL
      selectedWebview.setAttribute('src', loadUrl);
      selectedWebview.src = loadUrl;
      delete selectedWebview.dataset.src;
      startLoadingAnimation();
    }
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
    
    // Title and site meta
    const titleElement = document.createElement('div');
    titleElement.className = 'tab-title';
    // Always show the stored title or fallback to URL
    const displayTitle = tab.title || tab.url;
    titleElement.textContent = displayTitle;
    titleElement.title = tab.title || displayTitle;
    const domain = tab.url ? new URL(tab.url).hostname : '';
    const metaElement = document.createElement('div');
    metaElement.className = 'tab-meta';
    metaElement.textContent = domain;
    
    const closeElement = document.createElement('div');
    closeElement.className = 'tab-close';
    closeElement.innerHTML = '<i class="fas fa-times"></i>';
    closeElement.title = 'Close tab';
    
    tabItem.appendChild(faviconElement);
    tabItem.appendChild(titleElement);
    tabItem.appendChild(metaElement);
    tabItem.appendChild(closeElement);
    
    // Media progress indicator inside tab
    const progressBar = document.createElement('div');
    progressBar.className = 'media-progress-bar';
    if (tab.mediaProgress) {
      progressBar.style.transform = `scaleX(${tab.mediaProgress})`;
      progressBar.style.visibility = 'visible';
    } else {
      progressBar.style.visibility = 'hidden';
    }
    tabItem.appendChild(progressBar);
    
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
  // Hide media bar on any navigation events
  ['did-navigate', 'did-navigate-in-page', 'dom-ready'].forEach(evt => {
    webviewElement.addEventListener(evt, () => {
      // No global mediaStrip
    });
  });
  // Inject custom scrollbar styling
  injectScrollbarCSS(webviewElement);
  webviewElement.addEventListener('did-start-loading', () => {
    // reset media bar on navigation or reload
    // No global mediaStrip
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
        updateUrlInput(event.url);
      }
    }
  });
  
  // Update URL input on navigation
  webviewElement.addEventListener('did-navigate', () => {
    if (webviewElement.classList.contains('active')) updateUrlInput(webviewElement.getURL());
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
  
  // Update loading progress
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
  
  // Ensure media bar hidden once page fully loads
  webviewElement.addEventListener('did-finish-load', () => {
    // No global mediaStrip
  });
  
  // Handle webview ready
  webviewElement.addEventListener('dom-ready', () => {
    injectScrollbarCSS(webviewElement);
    updateReadingMode();
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
  
  // Hook this webview into history tracking
  webviewElement.addEventListener('did-navigate', () => addHistoryEntry(webviewElement));
  webviewElement.addEventListener('did-navigate-in-page', () => addHistoryEntry(webviewElement));
  
  webviewElement.addEventListener('ipc-message', (event) => {
    const selector = `.tab-item[data-tab-id="${webviewElement.id}"] .media-progress-bar`;
    const progressBar = document.querySelector(selector);
    if (!progressBar) return;
    if (event.channel === 'media-progress') {
      const prog = event.args[0];
      if (prog > 0 && prog <= 1) {
        progressBar.style.transform = `scaleX(${prog})`;
        progressBar.style.visibility = 'visible';
      } else {
        progressBar.style.visibility = 'hidden';
      }
    } else if (event.channel === 'media-playing') {
      const playing = event.args[0];
      if (!playing) {
        progressBar.style.visibility = 'hidden';
      }
    } else if (event.channel === 'social-login-detected') {
      showSocialUnsupportedNotice();
    }
  });
  
  // Persist lastPage on navigation
  webviewElement.addEventListener('did-navigate', () => {
    addHistoryEntry(webviewElement);
    if (settings.restoreLastPage && webviewElement.classList.contains('active')) {
      localStorage.setItem('lastPage', webviewElement.getURL());
    }
  });
  
  webviewElement.addEventListener('did-navigate-in-page', (event) => {
    if (webviewElement.classList.contains('active')) {
      updateUrlInput(event.url);
      if (settings.restoreLastPage) {
        localStorage.setItem('lastPage', event.url);
      }
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

// Show tabs viewport
function showTabsViewport() {
  tabsViewport.classList.add('active');
  document.body.classList.add('tabs-active');
  appContainer.classList.add('tabs-open');
  
  logMessage('info', 'Tab viewport opened');
}

// Hide tabs viewport
function hideTabsViewport() {
  tabsViewport.classList.remove('active');
  document.body.classList.remove('tabs-active');
  appContainer.classList.remove('tabs-open');
  
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
      hideTabsViewport();
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
// Removed errorDismiss element reference and its click handler

// IPC event handlers
// Removed dark mode change handler to avoid calling undefined API

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

// Listen for 'adblock-blocked' events and log them to console so user can verify the handler is firing
window.electronAPI.onAdblockBlocked((host) => {
  console.log(`Adblock event: blocked request to ${host}`);
  // Show a quick toast notification in the UI
  const toast = document.createElement('div');
  toast.className = 'adblock-toast';
  toast.textContent = `Blocked resource from ${host}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
});

// Listen for fullscreen mode via Electron
let dateTimer;
window.electronAPI.onFullscreenChanged(isFullscreen => {
  if (isFullscreen) {
    updateDateTime();
    fsDateTime.classList.remove('hidden');
    dateTimer = setInterval(updateDateTime, 1000);
  } else {
    fsDateTime.classList.add('hidden');
    clearInterval(dateTimer);
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  // Zoom controls: Ctrl+Plus and Ctrl+Minus
  if (event.ctrlKey) {
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

// History hover detection
historyTriggerArea.addEventListener('mouseenter', () => {
  clearTimeout(historyCloseTimer);
  historyHoverTimer = setTimeout(() => {
    historyViewport.classList.add('active');
    appContainer.classList.add('history-open');
  }, 300);
});
historyTriggerArea.addEventListener('mouseleave', () => {
  clearTimeout(historyHoverTimer);
});
historyViewport.addEventListener('mouseleave', (e) => {
  // Check if we're not moving to the trigger area
  if (e.relatedTarget !== historyTriggerArea) {
    historyCloseTimer = setTimeout(() => {
      historyViewport.classList.remove('active');
      appContainer.classList.remove('history-open');
    }, 500);
  }
});

// Prevent hover timer from closing viewport if mouse enters back
historyViewport.addEventListener('mouseenter', () => {
  clearTimeout(historyCloseTimer);
});

// Click outside to close history viewport
document.addEventListener('click', (e) => {
  if (historyViewport.classList.contains('active') &&
      !historyViewport.contains(e.target) &&
      !historyTriggerArea.contains(e.target)) {
    historyViewport.classList.remove('active');
    appContainer.classList.remove('history-open');
  }
});

// History item click handlers
historyList.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('.history-item-close');
  if (closeBtn) {
    const idx = parseInt(closeBtn.getAttribute('data-index'));
    historyData.splice(idx, 1);
    saveHistory();
    renderHistory();
    return;
  }
  const item = e.target.closest('.history-item');
  if (item) {
    const idx = parseInt(item.getAttribute('data-index'));
    const entry = historyData[idx];
    if (entry) {
      navigateToUrl(entry.url);
      historyViewport.classList.remove('active');
      appContainer.classList.remove('history-open');
    }
  }
});

// Clear all history
clearHistoryBtn.addEventListener('click', () => {
  historyData = [];
  saveHistory();
  renderHistory();
});

// Hook into navigation events to save history
document.querySelectorAll('webview').forEach(webview => {
  webview.addEventListener('did-navigate', () => addHistoryEntry(webview));
  webview.addEventListener('did-navigate-in-page', () => addHistoryEntry(webview));
});

// Render history on startup
renderHistory();

// Tabs clock functionality
const tabsTimeElem = document.getElementById('tabs-time');
const tabsDateElem = document.getElementById('tabs-date');

// Function to update clock with actual system time
function updateDateTime() {
  const now = new Date();
  if (tabsTimeElem && tabsDateElem) {
    tabsTimeElem.textContent = formatTime(now);
    tabsDateElem.textContent = formatDate(now);
  }
}

// Initialize with current time
updateDateTime();
setInterval(updateDateTime, 1000);

function formatTime(date) {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function formatDate(date) {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${weekday} ${day}, ${year}`;
}

// Reading Mode elements reference
let readingBtn;

function updateReadingMode() {
  if (!readingBtn) return;
  const activeView = document.querySelector('webview.active');
  readingBtn.style.display = 'none';
  if (activeView) {
    activeView.executeJavaScript(`!!document.querySelector('article, main')`).then(hasArticle => {
      readingBtn.style.display = hasArticle ? 'flex' : 'none';
    });
  }
}

// Reading Mode injection helper
function __nuruInjectReadingMode() {
  // Remove existing overlay
  const oldOverlay = document.getElementById('nuru-reading-overlay');
  if (oldOverlay) oldOverlay.remove();
  // Find article/main
  const container = document.querySelector('article, main');
  if (!container) return;
  // Extract main article content: headings, paragraphs, blockquotes
  const articleClone = document.createElement('div');
  const selectors = ['h1','h2','h3','h4','h5','h6','p','blockquote'];
  const blacklistTexts = [
    'Facebook','Twitter','Flipboard','Comments','Print','Email',
    'Related Topics','Related article','More from','Most viewed','Recommended',
    'By entering your email','You\'ve successfully subscribed'
  ];
  const nodes = container.querySelectorAll(selectors.join(','));
  for (let node of nodes) {
    const tag = node.tagName.toLowerCase();
    const text = node.textContent.trim();
    if (tag === 'p' && text.length < 20) continue;  // skip short paragraphs
    if (blacklistTexts.some(b => text === b || text.startsWith(b))) break;  // stop at bottom content
    // skip any node containing links to other articles
    if (node.querySelector('a')) continue;
    articleClone.appendChild(node.cloneNode(true));
  }
  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'nuru-reading-overlay';
  overlay.style.cssText = 'position:fixed;z-index:99999;top:0;left:0;width:100vw;height:100vh;background:#181a1b;color:#fff;overflow:auto;display:flex;flex-direction:column;align-items:flex-start;padding:0;margin:0;transition:background .3s;font-family:Poppins,sans-serif;box-sizing:border-box;';
  // Inject style to enforce white text and Poppins
  const styleTag = document.createElement('style');
  styleTag.textContent = `
    #nuru-reading-overlay, #nuru-reading-overlay * { color: #fff !important; font-family: 'Poppins', sans-serif !important; }
    #nuru-reading-container h1, #nuru-reading-container h2, #nuru-reading-container h3, #nuru-reading-container h4, #nuru-reading-container h5, #nuru-reading-container h6 { font-weight: 700; margin-top: 1em; }
    #nuru-reading-container p { margin: 1em 0; }
    #nuru-reading-container blockquote { border-left: 4px solid #5661F4; margin: 1em 0; padding-left: 1em; font-style: italic; color: #ccc; }
    #nuru-reading-container a { color: #1E90FF !important; text-decoration: underline; }
  `;
  overlay.appendChild(styleTag);
  // Reader container
  const reader = document.createElement('div');
  reader.id = 'nuru-reading-container';
  reader.style.cssText = 'background:#23262a;color:#fff;max-width:720px;width:90vw;margin:48px auto 64px auto;padding:40px 32px;border-radius:16px;box-shadow:0 6px 32px rgba(0,0,0,0.10);font-size:1.18em;line-height:1.7;letter-spacing:.01em;font-family:Poppins,sans-serif;';
  reader.appendChild(articleClone);
  overlay.appendChild(reader);
  // Exit button
  const exitBtn = document.createElement('button');
  exitBtn.textContent = 'Exit Reading Mode';
  exitBtn.id = 'nuru-reading-exit-btn';
  exitBtn.style.cssText = 'position:fixed;right:32px;bottom:32px;z-index:100000;padding:14px 28px;background:#5661F4;color:#fff;border:none;border-radius:24px;font-size:1.1em;font-weight:600;box-shadow:0 2px 12px rgba(0,0,0,0.13);cursor:pointer;transition:background .2s;';
  exitBtn.onmouseenter = () => exitBtn.style.background = '#3942a9';
  exitBtn.onmouseleave = () => exitBtn.style.background = '#5661F4';
  exitBtn.onclick = () => overlay.remove();
  overlay.appendChild(exitBtn);
  // Append overlay to body
  document.body.appendChild(overlay);
}

// Flag to show social login notice once per page load
let socialLoginNoticeShown = false;

function showSocialUnsupportedNotice() {
  if (socialLoginNoticeShown) return;
  socialLoginNoticeShown = true;
  showNotification('info', 'Social Login Unsupported', 'NURU Browser currently does not support social login. Use an alternative method');
}

const origWindowOpen = window.open;
window.open = function(url, frameName, features) {
  const socialDomains = ['facebook.com', 'accounts.google.com', 'api.twitter.com', 'github.com', 'linkedin.com', 'apple.com'];
  if (socialDomains.some(d => url.includes(d))) {
    // Reset flag to allow notification on manual social login click
    socialLoginNoticeShown = false;
    showSocialUnsupportedNotice();
    return null;
  }
  return origWindowOpen.apply(window, arguments);
};

document.addEventListener('DOMContentLoaded', async () => {
  // Load settings then init UI
  await loadSettings();
  initResources();
  renderResources(mediaSelect.value);
  initializeTabs();
  // Initialize Reading Mode button
  readingBtn = document.getElementById('reading-mode-btn');
  if (readingBtn) {
    updateReadingMode();
    readingBtn.addEventListener('click', () => {
      const activeView = document.querySelector('webview.active');
      if (activeView) {
        activeView.executeJavaScript('(' + __nuruInjectReadingMode.toString() + ')()')
          .catch(err => console.error('Reading mode injection failed:', err));
      }
    });
  }
  updateReadingMode();

  // --- Reading Mode Detection & Notification ---
  function detectArticlePage(webview) {
    if (!webview) return;
    webview.executeJavaScript(`!!document.querySelector('article, main')`).then(isArticle => {
      const btn = document.getElementById('reading-mode-btn');
      if (btn) {
        if (isArticle) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
      }
    });
  }

  // Update reading-mode icon visibility for active webview
  function updateReadingMode() {
    const activeView = document.querySelector('webview.active');
    detectArticlePage(activeView);
  }

  // Listen for navigation events to detect article pages
  document.querySelectorAll('webview').forEach(webview => {
    webview.addEventListener('did-navigate', () => detectArticlePage(webview));
    webview.addEventListener('did-navigate-in-page', () => detectArticlePage(webview));
    webview.addEventListener('dom-ready', () => detectArticlePage(webview));
  });

  // Existing context menu and modal logic
  if (window.electronAPI && window.electronAPI.onContextMenuNewTab) {
    window.electronAPI.onContextMenuNewTab((url) => {
      // Create tab lazily without activating
      createTab(url, false);
      updateTabsUI();
    });
  }
  // Setup Nuru Selects modal
  const selectsOverlay = document.getElementById('selects-modal-overlay');
  const btnSelectClose = document.getElementById('selects-close');

  function toggleSelectsModal() {
    if (selectsOverlay) selectsOverlay.style.display = selectsOverlay.style.display === 'flex' ? 'none' : 'flex';
  }
  // Keyboard shortcuts: Ctrl+B for selects, Ctrl+D for diagnostics
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'b') toggleSelectsModal();
    if (e.ctrlKey && e.key.toLowerCase() === 'd') window.electronAPI.showDiagnostics();
  });
  // Context menu for selects
  if (window.electronAPI && window.electronAPI.onToggleSelectsModal) {
    window.electronAPI.onToggleSelectsModal(toggleSelectsModal);
  }
  // Close button
  if (btnSelectClose) btnSelectClose.addEventListener('click', toggleSelectsModal);
});

// Reset social login notification flag on webview navigation within DOMContentLoaded
document.querySelectorAll('webview').forEach(wv => {
  ['did-navigate', 'did-navigate-in-page', 'dom-ready'].forEach(evt => {
    wv.addEventListener(evt, () => { socialLoginNoticeShown = false; });
  });
});

// Suppress ERR_ABORTED (-3) errors from webviews
document.querySelectorAll('webview').forEach(wv => {
  wv.addEventListener('did-fail-load', (e) => {
    // Suppress ERR_ABORTED loads by preventing default logging
    if (e.errorCode === -3) { e.preventDefault(); return; }
    console.error(`Webview failed load: ${e.errorDescription} (${e.errorCode}) loading ${e.validatedURL}`);
  });
});

// Suppress ERR_ABORTED console errors from webviews
document.querySelectorAll('webview').forEach(wv => {
  wv.addEventListener('console-message', (e) => {
    // Filter out aborted-load guest view manager errors
    if (e.message.includes('ERR_ABORTED') && e.message.includes('GUEST_VIEW_MANAGER_CALL')) return;
    console.log(`Guest console: ${e.message}`);
  });
});
