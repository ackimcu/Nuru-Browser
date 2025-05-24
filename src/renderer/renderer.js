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
// Set the tabs list width to 95% and center it
tabsList.style.width = '95%';
tabsList.style.margin = '0 auto';
// Also style the tabs list header to match
const tabsListHeader = document.querySelector('.tabs-list-header');
if (tabsListHeader) {
  tabsListHeader.style.width = '95%';
  tabsListHeader.style.margin = '0 auto';
}
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
  // Show tabs viewport by default, unless hidden-by-default is enabled
  if (!settings.viewportsHiddenByDefault) {
    showTabsViewport();
  }
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
  // Navigate using configured search engine
  const engine = settings.search_engine || { url: 'https://www.google.com/search?q=' };
  const searchUrl = `${engine.url}${encodeURIComponent(q)}`;
  if (window.navigateToUrl) {
    window.navigateToUrl(searchUrl);
  } else {
    window.open(searchUrl);
  }
  // Save search query to history
  if (!history.includes(q)) history.push(q);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// Settings
let settings = {
  homepage: 'https://www.google.com/',
  frameless: true,
  zoom_factor: 1.0,
  restoreLastPage: true,
  search_engine: { name: 'google', url: 'https://www.google.com/search?q=' },
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

  // Apply theme
  const root = document.documentElement;
  switch (settings.theme) {
    case 'light':
      root.style.setProperty('--bg-color', '#ffffff');
      root.style.setProperty('--text-color', '#333333');
      root.style.setProperty('--border-color', '#e0e0e0');
      root.style.setProperty('--accent-color', '#5661F4');
      root.style.setProperty('--glass-bg', 'rgba(255,255,255,0.85)');
      root.style.setProperty('--glass-border', 'rgba(0,0,0,0.08)');
      break;
    case 'dark':
      root.style.setProperty('--bg-color', '#1f1f1f');
      root.style.setProperty('--text-color', '#f2f2f2');
      root.style.setProperty('--border-color', '#3a3a3a');
      root.style.setProperty('--accent-color', '#5661F4');
      root.style.setProperty('--glass-bg', 'rgba(31,31,31,0.85)');
      root.style.setProperty('--glass-border', 'rgba(255,255,255,0.08)');
      break;
    case 'blue':
      root.style.setProperty('--bg-color', '#e0f7fa');
      root.style.setProperty('--text-color', '#012f41');
      root.style.setProperty('--border-color', '#4dd0e1');
      root.style.setProperty('--accent-color', '#00bcd4');
      root.style.setProperty('--glass-bg', 'rgba(224,247,250,0.85)');
      root.style.setProperty('--glass-border', 'rgba(0,0,0,0.08)');
      break;
    case 'green':
      root.style.setProperty('--bg-color', '#e8f5e9');
      root.style.setProperty('--text-color', '#1b5e20');
      root.style.setProperty('--border-color', '#a5d6a7');
      root.style.setProperty('--accent-color', '#4caf50');
      root.style.setProperty('--glass-bg', 'rgba(232,245,233,0.85)');
      root.style.setProperty('--glass-border', 'rgba(0,0,0,0.08)');
      break;
    case 'purple':
      root.style.setProperty('--bg-color', '#f3e5f5');
      root.style.setProperty('--text-color', '#4a148c');
      root.style.setProperty('--border-color', '#e1bee7');
      root.style.setProperty('--accent-color', '#9c27b0');
      root.style.setProperty('--glass-bg', 'rgba(243,229,245,0.85)');
      root.style.setProperty('--glass-border', 'rgba(0,0,0,0.08)');
      break;
    default:
      // No theme override
      break;
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
  // Skip showing the popup for social login messages
  if (title === 'Social Login Not Supported') {
    // Just log the message without showing the popup
    logMessage('info', `${title}: ${message}`);
    return;
  }
  
  // Show error popup for all other error types
  errorTitle.textContent = title;
  errorMessage.textContent = message;
  errorOverlay.classList.remove('hidden');
  
  logMessage('error', `${title}: ${message}`);
}

// Setup error close button
const errorCloseBtn = document.getElementById('error-close-btn');
if (errorCloseBtn) {
  errorCloseBtn.addEventListener('click', () => {
    errorOverlay.classList.add('hidden');
  });
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
  if (tabs.length > 0) return;
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
  // Prevent duplicate tabs for same URL
  const existing = tabs.find(t => t.url === url);
  if (existing) {
    if (activate) switchToTab(existing.id);
    return existing.id;
  }
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
        // Auto-hide tabs after selection only if hidden-by-default is enabled
        if (settings.viewportsHiddenByDefault) hideTabsViewport();
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
  
  // Remove any existing 'new tab' button before creating a new one
  const existingNewTab = document.querySelector('.tabs-viewport .new-tab');
  if (existingNewTab) existingNewTab.remove();

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
  // Add inline style to lessen width and center the button
  newTabButton.style.width = '95%';
  // Center horizontally and add bottom margin to avoid overlapping footer separator
  newTabButton.style.margin = '0 auto 5px';
  
  newTabButton.addEventListener('click', () => {
    createTab();
    // Don't auto-hide tabs when creating a new tab
  });
  
  // Insert the new tab button just above the version footer
  const footer = document.querySelector('.tabs-viewport .version-footer');
  footer.parentNode.insertBefore(newTabButton, footer);
  
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
  
  // Inject social login detection
  injectSocialLoginDetection(webviewElement);
  
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
      // Log detection without showing overlay
      logMessage('info', 'Social login detection blocked');
    } else if (event.channel === 'social-login-tooltip') {
      // Show a one-time notification for unsupported social login
      showNotification('Social Login Unsupported', 'NURU Browser does not support social login.', 'info');
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
  if (settings.viewportsHiddenByDefault && e.relatedTarget !== tabsTriggerArea) {
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
  if (settings.viewportsHiddenByDefault &&
      tabsViewport.classList.contains('active') &&
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

window.electronAPI.onSettingsUpdated((newSettings) => {
  // Update stored settings and reapply UI changes (e.g., theme)
  settings = newSettings;
  applySettings();
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
    // Hide tabs viewport when history opens
    hideTabsViewport();
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
      // Re-show tabs viewport unless hidden-by-default is enabled
      if (!settings.viewportsHiddenByDefault) showTabsViewport();
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
    // Re-show tabs viewport unless hidden-by-default is enabled
    if (!settings.viewportsHiddenByDefault) showTabsViewport();
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

// Robust Reading Mode injection helper
function __nuruInjectReadingMode() {
  // --- SVG Icons ---
  const icons = {
    theme: `<svg width="20" height="20" fill="none" viewBox="0 0 20 20"><path d="M10 2v2M10 16v2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M2 10h2M16 10h2M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="10" r="4" fill="currentColor"/></svg>`,
    fontSize: `<svg width="20" height="20" fill="none" viewBox="0 0 20 20"><path d="M4 16V4m0 0h12M4 4l6 12 6-12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    fontFamily: `<svg width="20" height="20" fill="none" viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 8h6v4H7z" fill="currentColor"/></svg>`,
    time: `<svg width="20" height="20" fill="none" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v4l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
  };

  // Remove existing overlay
  const oldOverlay = document.getElementById('nuru-reading-overlay');
  if (oldOverlay) oldOverlay.remove();

  // --- Robust Content Extraction ---
  function extractMainContent() {
    // Step 1: Gather candidates
    const candidates = Array.from(document.querySelectorAll('article, main, section'))
      .filter(el => el.offsetParent !== null && !el.closest('nav, aside, footer, header'));
    // Step 2: Score by text length and # of <p>
    let bestScore = 0, bestEls = [];
    candidates.forEach(el => {
      const text = el.innerText || '';
      const len = text.replace(/\s+/g, ' ').length;
      const pCount = el.querySelectorAll('p').length;
      const score = len + pCount * 100;
      if (score > bestScore) {
        bestScore = score;
        bestEls = [el];
      } else if (score === bestScore) {
        bestEls.push(el);
      }
    });
    // Step 3: If multiple best siblings, combine them
    if (bestEls.length > 1) {
      // Only combine if siblings, else use the first
      const parent = bestEls[0].parentElement;
      if (bestEls.every(e => e.parentElement === parent)) {
        const wrapper = document.createElement('div');
        bestEls.forEach(e => wrapper.appendChild(e.cloneNode(true)));
        return wrapper;
      }
      return bestEls[0];
    }
    if (bestEls.length === 1) return bestEls[0];
    // Step 4: Fallback to largest visible div with many paragraphs
    let maxScore = 0, bestDiv = null;
    document.querySelectorAll('div').forEach(div => {
      if (div.offsetParent === null) return;
      if (div.closest('nav, aside, footer, header')) return;
      const text = div.innerText || '';
      const len = text.replace(/\s+/g, ' ').length;
      const pCount = div.querySelectorAll('p').length;
      const score = len + pCount * 100;
      if (score > maxScore) {
        maxScore = score;
        bestDiv = div;
      }
    });
    return bestDiv;
  }

  const container = extractMainContent();
  if (!container) return;

  // --- Uniform Article Extraction ---
  function extractUniformArticle(node) {
    // Helper to create and return a new element with class
    function make(tag, cls, text) {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      if (text) el.textContent = text;
      return el;
    }
    // Article root
    const article = document.createElement('div');
    article.className = 'cb-article';
    // Robust Title Extraction (container first, then global fallback)
    let titleElem = node.querySelector('h1, [class*="headline"], [itemprop="headline"], [role="heading"], [data-testid*="headline"]');
    if (!titleElem) titleElem = node.querySelector('h2');
    // If not found in container, try the whole document
    if (!titleElem) titleElem = document.querySelector('h1[data-editable="headlineText"], h1[id="maincontent"], h1[class*="headline"], h1, [class*="headline"], [itemprop="headline"], [role="heading"], [data-testid*="headline"]');
    // If still not found, get first visible h1 in document
    if (!titleElem) {
      const allH1s = Array.from(document.querySelectorAll('h1'));
      titleElem = allH1s.find(el => el.offsetParent !== null && el.textContent && el.textContent.trim().length > 4);
    }
    let mainTitle = null;
    let mainImgSrc = null;
    if (titleElem && titleElem.textContent && titleElem.textContent.trim().length > 4) {
      mainTitle = titleElem.textContent.trim();
      article.appendChild(make('h1', 'cb-title', mainTitle));
      // Look for a main image immediately after the headline
      let nextImg = titleElem.nextElementSibling;
      while (nextImg && nextImg.tagName !== 'IMG') nextImg = nextImg.nextElementSibling;
      if (nextImg && nextImg.tagName === 'IMG' && nextImg.src) {
        mainImgSrc = nextImg.src;
        const imgEl = document.createElement('img');
        imgEl.className = 'cb-img';
        imgEl.src = mainImgSrc;
        if (nextImg.alt) imgEl.alt = nextImg.alt;
        article.appendChild(imgEl);
      }
    } else {
      // Fallback: use document.title if nothing found
      if (document.title && document.title.trim().length > 4) {
        mainTitle = document.title.trim();
        article.appendChild(make('h1', 'cb-title', mainTitle));
      }
    }
    // Author/Date (if present)
    let metaAdded = false;
    const author = node.querySelector('[itemprop="author"], .author, .byline');
    const date = node.querySelector('time, .date, [itemprop="datePublished"]');
    if (author || date) {
      const meta = document.createElement('div');
      meta.className = 'cb-meta';
      if (author) meta.appendChild(make('span', 'cb-author', author.textContent.trim()));
      if (date) meta.appendChild(make('span', 'cb-date', date.textContent.trim()));
      article.appendChild(meta);
      metaAdded = true;
    }
    // Main image (first <img> or <figure> img)
    const mainImg = node.querySelector('figure img, img');
    if (mainImg) {
      const img = document.createElement('img');
      img.className = 'cb-main-image';
      img.src = mainImg.src;
      if (mainImg.alt) img.alt = mainImg.alt;
      article.appendChild(img);
    }
    // Article body: headings, paragraphs, blockquotes, lists, videos
    // Expanded allowed elements for richer formatting
    const allowed = ['H2','H3','H4','H5','H6','P','BLOCKQUOTE','UL','OL','LI','IMG','VIDEO','IFRAME','A','MARK','STRONG','EM','B','I','U','CODE','SUP','SUB','SPAN'];
    // Deduplicate images by src, and never repeat the main/hero image under the headline
    const seenImgs = new Set();
    if (mainImgSrc) seenImgs.add(mainImgSrc);
    // Patterns for non-article content
    const NON_ARTICLE_PATTERNS = [
      /related|outbrain|sidebar|share|promo|newsletter|ad-|ads|advert|footer|nav|breadcrumb|pagination|cookie|subscribe|social|comment|disclaimer|author|byline|caption|credit|meta|tool|button|popup|modal|survey|poll|icon|tag|category|label|date|time|readmore|recommend|trending|popular|sponsored|paywall|login|signup|register|banner|breaking|ticker|player|embed|yt-|youtube|fb-|facebook|twitter|instagram/i
    ];
    node.querySelectorAll(allowed.map(tag=>tag.toLowerCase()).join(',')).forEach(el => {
      // Skip unwanted parents
      if (el.closest('nav, aside, footer, header')) return;
      // Skip elements or parents with non-article patterns in class, id, role, or aria-label
      let skip = false;
      let checkEl = el;
      for (let i = 0; i < 2 && checkEl; i++) { // check self and parent
        const attrs = [checkEl.className, checkEl.id, checkEl.getAttribute('role'), checkEl.getAttribute('aria-label')];
        if (attrs.some(attr => attr && NON_ARTICLE_PATTERNS.some(rx => rx.test(attr)))) {
          skip = true; break;
        }
        checkEl = checkEl.parentElement;
      }
      if (skip) return;
      // skip duplicate main title (robust)
      if (mainTitle && el.textContent && el.textContent.trim() === mainTitle) return;
      // also skip if it's a headline-like selector
      if (el.matches && el.matches('h1, [class*="headline"], [itemprop="headline"], [role="heading"], [data-testid*="headline"]')) return;
      // skip visually hidden or empty/very short elements (not in lists/quotes)
      const txt = el.textContent ? el.textContent.trim() : '';
      if (el.offsetParent === null || (txt.length < 2 && !['LI','BLOCKQUOTE','MARK'].includes(el.tagName))) return;
      let newEl;
      if (el.tagName === 'IMG') {
        if (!el.src || seenImgs.has(el.src)) return;
        seenImgs.add(el.src);
        newEl = document.createElement('img');
        newEl.className = 'cb-img';
        newEl.src = el.src;
        if (el.alt) newEl.alt = el.alt;
      } else if (el.tagName === 'VIDEO' || el.tagName === 'IFRAME') {
        newEl = document.createElement('div');
        newEl.className = 'cb-video';
        newEl.innerHTML = el.outerHTML;
      } else if (el.tagName === 'A') {
        newEl = document.createElement('a');
        newEl.className = 'cb-link';
        newEl.href = el.href;
        newEl.target = '_blank';
        newEl.rel = 'noopener noreferrer';
        newEl.innerHTML = el.innerHTML;
      } else if (el.tagName === 'BLOCKQUOTE') {
        newEl = document.createElement('blockquote');
        newEl.className = 'cb-quote';
        newEl.innerHTML = el.innerHTML;
      } else if (el.tagName === 'MARK' || (el.tagName === 'SPAN' && el.classList.contains('highlight'))) {
        newEl = document.createElement('mark');
        newEl.className = 'cb-highlight';
        newEl.innerHTML = el.innerHTML;
      } else if ([ 'STRONG','EM','B','I','U','CODE','SUP','SUB','SPAN'].includes(el.tagName)) {
        newEl = document.createElement(el.tagName.toLowerCase());
        newEl.className = 'cb-' + el.tagName.toLowerCase();
        newEl.innerHTML = el.innerHTML;
      } else {
        // For paragraphs, lists, etc., deep clone with inline formatting
        newEl = document.createElement(el.tagName.toLowerCase());
        newEl.className = 'cb-' + el.tagName.toLowerCase();
        newEl.innerHTML = el.innerHTML;
      }
      if (newEl) article.appendChild(newEl);
    });
    return article;
  }
  const articleUniform = extractUniformArticle(container);

  // --- Overlay UI ---
  const overlay = document.createElement('div');
  overlay.id = 'nuru-reading-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.tabIndex = -1;
  overlay.style.cssText = 'position:fixed;z-index:99999;top:0;left:0;width:100vw;height:100vh;overflow:auto;display:flex;flex-direction:column;align-items:center;background:#181a1b;color:#fff;margin:0;padding:0;transition:background .3s;font-family:Poppins,sans-serif;box-sizing:border-box;';

  // --- Extract and Clone Website Header ---
  let siteHeader = document.querySelector('header');
  if (!siteHeader) {
    siteHeader = document.querySelector('.header, #header, .site-header, #site-header, [role="banner"]');
  }
  let headerClone = null;
  if (siteHeader) {
    // Helper to copy computed styles for key properties
    function copyComputedStyles(src, dest, depth=0) {
      if (!src || !dest || depth > 2) return; // limit recursion depth
      const computed = window.getComputedStyle(src);
      const props = [
        'background','backgroundColor','color','font','fontFamily','fontWeight','fontSize','lineHeight','padding','margin','border','borderRadius','boxShadow','display','alignItems','justifyContent','gap','height','minHeight','maxHeight','width','minWidth','maxWidth','textAlign','textTransform','letterSpacing','overflow','zIndex','position','top','left','right','bottom','flex','flexDirection','flexWrap','alignSelf','justifySelf','verticalAlign','whiteSpace','textOverflow','boxSizing'
      ];
      props.forEach(p => {
        try { dest.style[p] = computed[p]; } catch(e){}
      });
      // Recursively copy for direct children
      for (let i=0; i<src.children.length; ++i) {
        copyComputedStyles(src.children[i], dest.children[i], depth+1);
      }
    }
    headerClone = siteHeader.cloneNode(true);
    headerClone.id = 'nuru-reading-headerbar';
    // Wrap in a container to minimize overlay style conflicts
    const headerWrap = document.createElement('div');
    headerWrap.id = 'nuru-reading-headerbar-wrap';
    headerWrap.style.position = 'sticky';
    headerWrap.style.top = '0';
    headerWrap.style.zIndex = '100001';
    headerWrap.style.width = '100vw';
    headerWrap.style.background = 'rgba(32,34,38,0.98)';
    headerWrap.style.boxSizing = 'border-box';
    headerWrap.style.borderBottom = '1px solid #232323';
    headerWrap.appendChild(headerClone);
    // Copy computed styles from original header to clone
    copyComputedStyles(siteHeader, headerClone);
    overlay.appendChild(headerWrap);
  } else {
    // Fallback: show document title and hostname as before
    const headerBar = document.createElement('div');
    headerBar.id = 'nuru-reading-headerbar';
    headerBar.innerHTML = `<span class="cb-header-title">${document.title || ''}</span><span class="cb-header-site">${location.hostname}</span>`;
    overlay.appendChild(headerBar);
  }

  // --- Controls (Simplified: Theme Only) ---
  const controls = document.createElement('div');
  controls.id = 'nuru-reading-controls';
  controls.innerHTML = `
    <label title="Theme">${icons.theme}
      <select id="nuru-theme-select">
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="sepia">Sepia</option>
      </select>
    </label>
    <span id="nuru-reading-time" style="margin-left:auto;">${icons.time}</span>
  `;
  overlay.appendChild(controls);

  // --- Style ---
  const styleTag = document.createElement('style');
  styleTag.textContent = `
    #nuru-reading-overlay, #nuru-reading-overlay * { font-family: 'Poppins', sans-serif !important; }
    #nuru-reading-headerbar {
      width: 100vw;
      min-height: 38px;
      background: rgba(32,34,38,0.98);
      color: #fff;
      font-size: 1.11em;
      font-weight: 600;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      box-sizing: border-box;
      border-bottom: 1px solid #232323;
      letter-spacing: .01em;
      z-index: 100001;
      position: sticky;
      top: 0;
    }
    .cb-header-title {
      font-size: 1.12em;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 60vw;
    }
    .cb-header-site {
      font-size: 1em;
      font-weight: 400;
      color: #bbb;
      margin-left: 18px;
      white-space: nowrap;
    }
    .cb-article { max-width: 720px; margin: 0; padding: 0; }
    .cb-title { font-size: 2.2em; font-weight: 700; margin: 0 0 0.5em 0; text-align: left; }
    .cb-meta { font-size: 1em; color: #bbb; margin-bottom: 1.5em; display: flex; gap: 1.5em; }
    .cb-author { font-style: italic; }
    .cb-date { font-style: normal; }
    .cb-main-image { display: block; max-width: 100%; margin: 1.5em 0; border-radius: 10px; }
    .cb-img { display: block; max-width: 100%; margin: 1.2em 0; border-radius: 8px; }
    .cb-video { margin: 1.5em 0; }
    .cb-article h2, .cb-article h3, .cb-article h4, .cb-article h5, .cb-article h6 { font-weight: 600; margin-top: 1.5em; margin-bottom: 0.6em; text-align: left; }
    .cb-article p { margin: 1.1em 0; text-align: left; font-size: 1.13em; }
    .cb-article blockquote { border-left: 4px solid #5661F4; margin: 1.3em 0; padding-left: 1.2em; font-style: italic; color: #ccc; background: rgba(86,97,244,0.06); border-radius: 6px; }
    .cb-article ul, .cb-article ol { margin: 1.2em 0 1.2em 2.2em; text-align: left; }
    .cb-article li { margin-bottom: 0.4em; font-size: 1.09em; }
    .cb-article a { color: #1E90FF !important; text-decoration: underline; }

    #nuru-reading-controls {
      max-width: 720px;
      width: 90vw;
      margin: 16px auto 0 auto;
      margin-bottom: 8px;
      background: rgba(32,34,38,0.92);
      border-radius: 16px;
      box-shadow: 0 2px 24px rgba(0,0,0,0.13);
      padding: 10px 22px 10px 18px;
      display: flex;
      gap: 18px;
      align-items: center;
      justify-content: flex-start;
      position: relative;
      min-height: 42px;
      font-size: 1em;
      transition: background .3s;
      position: static;
    }
    #nuru-reading-controls label {
      display: flex; align-items: center; gap: 6px; font-size: 1em; color: #fff; margin: 0;
    }
    #nuru-reading-controls select, #nuru-reading-controls button {
      font-size:1em;padding:4px 10px;border-radius:8px;border:1px solid #bbb;background:#222;color:#fff; margin-left: 2px;
    }
    #nuru-reading-controls span#nuru-reading-time { margin-left: 10px; font-size: 0.98em; color: #bbb; display: flex; align-items: center; gap: 4px; }
    #nuru-reading-progress { width: 100%; height: 4px; background: #2e2e2e; border-radius: 2px; margin: 0 0 24px 0; overflow: hidden; }
    #nuru-reading-progress-bar { height: 100%; background: #5661F4; width: 0; transition: width 0.2s; }
    .nuru-theme-dark { background: #181a1b !important; color: #fff !important; }
    .nuru-theme-light { background: #fff !important; color: #222 !important; }
    .nuru-theme-sepia { background: #f4ecd8 !important; color: #322 !important; }
    #nuru-reading-exit-btn { position:fixed;right:32px;bottom:32px;z-index:100000;padding:14px 28px;background:#5661F4;color:#fff;border:none;border-radius:24px;font-size:1.1em;font-weight:600;box-shadow:0 2px 12px rgba(0,0,0,0.13);cursor:pointer;transition:background .2s; }
    #nuru-reading-exit-btn:hover { background:#3942a9; }
    #nuru-reading-container { background:inherit;color:inherit;max-width:720px;width:90vw;margin:0 0 64px 0;padding:40px 32px 32px 32px;border-radius:16px;box-shadow:0 6px 32px rgba(0,0,0,0.10);font-size:1.18em;line-height:1.7;letter-spacing:.01em;text-align:left; }
    .nuru-theme-light #nuru-reading-controls { background: rgba(255,255,255,0.98); color: #222; }
    .nuru-theme-light #nuru-reading-controls label { color: #222; }
    .nuru-theme-light #nuru-reading-controls select, .nuru-theme-light #nuru-reading-controls button { background:#f4f4f4;color:#222;border:1px solid #ccc; }
    .nuru-theme-sepia #nuru-reading-controls { background: #f4ecd8; color: #322; }
    .nuru-theme-sepia #nuru-reading-controls label { color: #322; }
    .nuru-theme-sepia #nuru-reading-controls select, .nuru-theme-sepia #nuru-reading-controls button { background:#f4ecd8;color:#322;border:1px solid #e2d3b1; }
  `;
  overlay.appendChild(styleTag);

  // --- Progress Bar ---
  const progress = document.createElement('div');
  progress.id = 'nuru-reading-progress';
  progress.innerHTML = '<div id="nuru-reading-progress-bar"></div>';
  overlay.appendChild(progress);

  // --- Reader Container ---
  const reader = document.createElement('div');
  reader.id = 'nuru-reading-container';
  reader.appendChild(articleUniform);
  overlay.appendChild(reader);

  // --- Exit Button ---
  const exitBtn = document.createElement('button');
  exitBtn.textContent = 'Exit Reading Mode';
  exitBtn.id = 'nuru-reading-exit-btn';
  exitBtn.onclick = () => overlay.remove();
  overlay.appendChild(exitBtn);

  // --- Append overlay ---
  document.body.appendChild(overlay);
  overlay.focus();

  // --- Settings Persistence ---
  function saveSettings(obj) {
    localStorage.setItem('nuruReadingMode', JSON.stringify(obj));
  }
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem('nuruReadingMode')) || {};
    } catch { return {}; }
  }

  // --- Apply Settings ---
  const settings = loadSettings();
  function applySettings() {
    // Theme
    overlay.classList.remove('nuru-theme-dark','nuru-theme-light','nuru-theme-sepia');
    overlay.classList.add('nuru-theme-' + (settings.theme || 'dark'));
    // Font size and family: default only
    reader.style.fontSize = '16px';
    reader.style.fontFamily = 'Poppins,sans-serif';
    // Controls reflect
    document.getElementById('nuru-theme-select').value = settings.theme || 'dark';
  }
  applySettings();

  // --- Controls Events ---
  document.getElementById('nuru-theme-select').onchange = (e) => {
    settings.theme = e.target.value;
    saveSettings(settings);
    applySettings();
  };
  // Font size and family controls removed

  // --- Reading Progress Bar ---
  reader.onscroll = overlay.onscroll = function() {
    const total = reader.scrollHeight - reader.clientHeight;
    const scrolled = Math.max(0, Math.min(reader.scrollTop || overlay.scrollTop, total));
    document.getElementById('nuru-reading-progress-bar').style.width = (100 * scrolled / (total || 1)) + '%';
  };
  overlay.addEventListener('scroll', reader.onscroll);

  // --- Estimated Reading Time ---
  function estimateReadingTime(text) {
    const wpm = 220;
    const words = text.split(/\s+/).length;
    return Math.ceil(words / wpm);
  }
  const minutes = estimateReadingTime(reader.innerText);
  document.getElementById('nuru-reading-time').innerHTML = icons.time + (minutes ? (minutes + ' min read') : '');

  // --- Keyboard Shortcuts ---
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') overlay.remove();
    if ((e.key === '+' || e.key === '=') && settings.fontSize < 36) {
      settings.fontSize = (settings.fontSize || 20) + 2;
      saveSettings(settings); applySettings();
    }
    if ((e.key === '-' || e.key === '_') && settings.fontSize > 12) {
      settings.fontSize = (settings.fontSize || 20) - 2;
      saveSettings(settings); applySettings();
    }
  });
  overlay.tabIndex = 0;
  overlay.focus();

  // --- Accessibility: trap focus inside overlay ---
  overlay.addEventListener('focusout', function(e) {
    if (!overlay.contains(e.relatedTarget)) {
      setTimeout(() => overlay.focus(), 0);
    }
  });
}

// Replace broken social login injection function with a no-op
function injectSocialLoginDetection(webview) {
  // No-op: social login detection handled by preload-webview.js
}

// Listen for messages from webviews about social login attempts
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'social-login-unsupported') {
    // Popup disabled but still log the attempt
    console.log('Social login attempt blocked:', event.data.element || 'unknown element');
  }
});

// Inject social login detection in each webview
document.querySelectorAll('webview').forEach(wv => {
  injectSocialLoginDetection(wv);
});

// Intercept window.open calls to detect and block social login popups
const origWindowOpen = window.open;
window.open = function(url, frameName, features) {
  // Comprehensive list of social login domains
  const socialDomains = [
    'accounts.google.com', 'apis.google.com', 'facebook.com', 'connect.facebook.net', 
    'api.twitter.com', 'twitter.com', 'appleid.apple.com', 'github.com', 
    'linkedin.com', 'api.linkedin.com', 'login.microsoftonline.com', 'login.live.com',
    'discord.com', 'auth.discord.com'
  ];
  
  // Check if this is a social login popup
  const isSocialLogin = socialDomains.some(domain => {
    if (typeof url === 'string') {
      return url.toLowerCase().includes(domain);
    }
    return false;
  });
  
  if (isSocialLogin) {
    console.log('Blocked social login popup:', url);
    // Popup disabled but still block the popup
    return null;
  }
  
  return origWindowOpen.apply(window, arguments);
};

// Optional: Tooltip logic for accessibility
const socialIcon = document.getElementById('social-login-unsupported-icon');
if (socialIcon) {
  socialIcon.addEventListener('click', () => {
    // Notification disabled
    console.log('Social login info icon clicked');
  });
}

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
