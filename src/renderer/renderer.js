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
const backButton = document.getElementById('back-button');
const forwardButton = document.getElementById('forward-button');
const closeButton = document.getElementById('close-button');
const tabsButton = document.getElementById('tabs-button');
const settingsBtn = document.getElementById('settings-btn');
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
if (mediaSelect) {
  mediaSelect.addEventListener('change', () => renderResources(mediaSelect.value));
}
if (addResourceBtn && addResourceForm) {
  addResourceBtn.addEventListener('click', () => addResourceForm.classList.remove('hidden'));
}
if (cancelResourceBtn && addResourceForm) {
  cancelResourceBtn.addEventListener('click', () => addResourceForm.classList.add('hidden'));
}

// Autofill resource fields from active webview
const addWebsiteBtn = document.getElementById('add-website-btn');
if (addWebsiteBtn) {
  addWebsiteBtn.addEventListener('click', () => {
    const webview = document.querySelector('webview.active');
    if (webview) {
      const url = webview.getURL();
      const name = webview.getTitle();
      if (newResourceUrl) newResourceUrl.value = url;
      if (newResourceName) newResourceName.value = name;
      if (addResourceForm) {
        addResourceForm.classList.remove('hidden');
      }
    }
  });
}

if (saveResourceBtn) {
  saveResourceBtn.addEventListener('click', () => {
    if (newResourceName && newResourceUrl && newResourceCategory) {
      const name = newResourceName.value.trim();
      const url = newResourceUrl.value.trim();
      const cat = newResourceCategory.value;
      if (name && url) {
        if (!resources[cat]) resources[cat] = [];
        resources[cat].push({ name, url });
        saveResources();
        if (mediaSelect) {
          renderResources(mediaSelect.value);
        }
        if (addResourceForm) {
          addResourceForm.classList.add('hidden');
        }
        newResourceName.value = '';
        newResourceUrl.value = '';
      }
    }
  });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  // Check if we're on the start page
  const isStartPage = window.location.pathname.includes('start-page.html');
  
  if (isStartPage) {
    // Start page is handled by start-page.js
    return;
  }
  
  // Load settings then init UI
  await loadSettings();
  initResources();
  if (mediaSelect) {
    renderResources(mediaSelect.value);
  }
  initializeTabs();
  // Show tabs viewport by default, unless hidden-by-default is enabled
  if (!settings.viewportsHiddenByDefault) {
    showTabsViewport();
  }
  
  // Handle messages from start page webview
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type) {
      switch (event.data.type) {
        case 'navigate-to-url':
          createTab(event.data.url, true);
          updateTabsUI();
          break;
        case 'open-new-tab':
          createTab(event.data.url || 'https://www.google.com', true);
          updateTabsUI();
          break;
        case 'show-downloads':
          toggleDownloadHistoryCard();
          break;
        case 'open-settings':
          showSettingsViewport();
          break;
        case 'clear-cache':
          if (window.electronAPI && window.electronAPI.clearCache) {
            window.electronAPI.clearCache().then(() => {
              showNotification('Cache cleared successfully', 'success');
            }).catch(() => {
              showNotification('Failed to clear cache', 'error');
            });
          }
          break;
      }
    }
  });

  // Initialize weather temperature unit setting
  const weatherTempUnitSelect = document.getElementById('weather-temperature-unit-select');
  if (weatherTempUnitSelect) {
    weatherTempUnitSelect.value = settings.cards?.weatherTemperatureUnit || 'celsius';
    
    // Add event listener for temperature unit change
    weatherTempUnitSelect.addEventListener('change', async (e) => {
      settings.cards = { ...settings.cards, weatherTemperatureUnit: e.target.value };
      
      // Save immediately and show notification
      try {
        const result = await window.electronAPI.updateSettings(settings);
        // updateSettings returns the settings object, not a result object
        if (result) {
          showNotification('Temperature unit updated', 'success');
          
          // Update weather display if weather is currently shown
          if (settings.cards?.weatherLocation) {
            try {
              await updateWeather();
            } catch (weatherError) {
              console.log('Weather update failed, but temperature unit was saved:', weatherError);
              // Don't show error for weather update failure, just log it
            }
          }
        } else {
          showNotification('Error', 'Failed to save temperature unit', 'error');
        }
      } catch (error) {
        console.error('Temperature unit save error:', error);
        showNotification('Error', 'Failed to save temperature unit', 'error');
      }
    });
  }
  
  // Initialize frameless toggle (inverted logic: checked = show frame, unchecked = frameless)
  const framelessToggle = document.getElementById('frameless-toggle');
  if (framelessToggle) {
    framelessToggle.checked = !settings.frameless;
    
    // Add event listener for frameless toggle change
    framelessToggle.addEventListener('change', async (e) => {
      settings.frameless = !e.target.checked; // Invert the logic
      
      // Update nav buttons and clock visibility immediately
      updateNavAndClockVisibility();
      
      // Save immediately and show notification
      try {
        const result = await window.electronAPI.updateSettings(settings);
        if (result) {
          showNotification('Window frame setting updated. Please restart the app to apply changes.', 'success');
        } else {
          showNotification('Error', 'Failed to save window frame setting', 'error');
        }
      } catch (error) {
        console.error('Frameless toggle save error:', error);
        showNotification('Error', 'Failed to save window frame setting', 'error');
      }
    });
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
    if (!webview || !webview.getWebContentsId) return;
    try {
      webview.executeJavaScript(`!!document.querySelector('article, main')`).then(isArticle => {
        const btn = document.getElementById('reading-mode-btn');
        if (btn) {
          if (isArticle) btn.classList.remove('hidden');
          else btn.classList.add('hidden');
        }
      }).catch(error => {
        // WebView not ready yet, skip detection
        console.log('WebView not ready for reading mode detection');
      });
    } catch (error) {
      // WebView not ready yet, skip detection
      console.log('WebView not ready for reading mode detection');
    }
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
    if (e.ctrlKey && e.key.toLowerCase() === 'd') {
      const toggle = document.querySelector('#show-browser-info-toggle');
      if (toggle) {
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change'));
      }
    }
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
  
  // Handle special URLs like nuru://start
  let finalUrl = url;
  if (url === 'nuru://start') {
    // Convert to file URL for the start page
    finalUrl = 'file://' + window.location.pathname.replace('index.html', 'start-page.html');
  }
  
  if (activeWebview) {
    activeWebview.src = finalUrl;
    logMessage('info', `Navigating to: ${finalUrl}`);
  } else {
    // Create a new tab if no active webview
    createTab(finalUrl);
  }
}

function updateUrlInput(url) {
  currentUrl = url;
  if (modernInput && modernInput !== document.activeElement) {
    modernInput.value = getShortUrl(url);
  } else if (modernInput) {
    modernInput.value = url;
  }
  
  // Update placeholder text based on current page
  if (modernInput) {
    const isStartPage = url === 'nuru://start' || url.includes('start-page.html');
    modernInput.placeholder = isStartPage ? 'Nuru Startpage' : 'Search or enter address...';
  }
}

// Modern search bar logic
const modernInput = document.getElementById('modern-search-input');
if (modernInput) {
  modernInput.addEventListener('click', () => {
    modernInput.select();
    updateSuggestions(modernInput.value);
  });
}
const suggestionsBox = document.getElementById('modern-suggestions');

// Home button logic
function setupHomeButton() {
  const btnHome = document.getElementById('home-btn');
  if (btnHome) {
    btnHome.addEventListener('click', async () => {
      try {
        // Always get fresh settings to ensure we have the latest homepage
        const currentSettings = await window.electronAPI.getSettings();
        const homepage = currentSettings.homepage || 'nuru://start';
        
        console.log('Home button clicked, homepage setting:', homepage);
        
        if (homepage && homepage.trim()) {
          navigateToUrl(homepage.trim());
        } else {
          showNotification('No homepage set in settings.', true);
        }
      } catch (error) {
        console.error('Error getting settings for home button:', error);
        // Fallback to current settings or default
        const homepage = settings?.homepage || 'nuru://start';
        console.log('Using fallback homepage:', homepage);
        navigateToUrl(homepage);
      }
    });
    console.log('Home button event listener attached');
  } else {
    console.warn('Home button not found in DOM');
  }
}

// Set up home button when DOM is ready
document.addEventListener('DOMContentLoaded', setupHomeButton);

// Also set up home button after settings are loaded (in case DOM loads before settings)
window.addEventListener('load', () => {
  // Re-setup home button to ensure it's properly attached
  setupHomeButton();
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
  const pinnedSection = document.getElementById('pinned-apps-container');
  if (active) {
    const h = suggestionsBox.getBoundingClientRect().height;
    header.style.transform = `translateY(${h}px)`;
    list.style.transform = `translateY(${h}px)`;
    if (pinnedSection) pinnedSection.style.transform = `translateY(${h}px)`;
  } else {
    header.style.transform = '';
    list.style.transform = '';
    if (pinnedSection) pinnedSection.style.transform = '';
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

if (modernInput) {
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
      if (suggestionsBox) suggestionsBox.classList.remove('open');
      highlightedIdx = -1;
      adjustTabs(false);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      if (suggestionsBox) suggestionsBox.classList.remove('open');
      highlightedIdx = -1;
      adjustTabs(false);
    }
  });
}

if (suggestionsBox) {
  suggestionsBox.addEventListener('mousedown', e => {
    // ignore delete button clicks
    if (e.target.classList.contains('suggest-delete')) return;
    const li = e.target.closest('li[data-idx]');
    if (li) {
      const idx = parseInt(li.getAttribute('data-idx'));
      if (modernInput) modernInput.value = filtered[idx];
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
      if (modernInput) updateSuggestions(modernInput.value);
      e.stopPropagation();
    }
  });
}

// Hide suggestions on blur (with delay for click)
if (modernInput) {
  modernInput.addEventListener('blur', () => setTimeout(() => {
    if (suggestionsBox) suggestionsBox.classList.remove('open');
    highlightedIdx = -1;
    adjustTabs(false);
  }, 120));

  // Show suggestions on focus if input has value
  modernInput.addEventListener('focus', () => {
    if (modernInput.value) updateSuggestions(modernInput.value);
  });
}

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

if (modernInput) {
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
}

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
  
  // Always use homepage setting as the primary URL
  const homepageURL = settings.homepage || 'https://www.google.com/';
  
  // Only use last page if restoreLastPage is enabled AND no specific homepage is set (or homepage is default)
  const shouldRestore = settings.restoreLastPage && (!settings.homepage || settings.homepage === 'https://www.google.com/' || settings.homepage === 'nuru://start');
  const lastPage = shouldRestore 
    ? (localStorage.getItem('lastPage') || homepageURL)
    : homepageURL;
    
  // Handle special URLs like nuru://start
  let finalURL = lastPage;
  if (lastPage === 'nuru://start') {
    // Convert to file URL for the start page
    finalURL = 'file://' + window.location.pathname.replace('index.html', 'start-page.html');
  }
  
  // Add the initial tab to the tabs array
  tabs.push({ id: 'webview-0', title: lastPage, url: lastPage, favicon: null });
  // Update the initial webview src
  activeWebview.setAttribute('src', finalURL);
  updateUrlInput(lastPage);
  // Render UI and bind events
  updateTabsUI();
  setupWebviewEvents(activeWebview);
  
  // Ensure placeholder is set correctly on initial load
  if (modernInput) {
    const isStartPage = lastPage === 'nuru://start' || lastPage.includes('start-page.html');
    modernInput.placeholder = isStartPage ? 'Nuru Startpage' : 'Search or enter address...';
  }
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
  
  // Update tab counter
  updateTabCounter();
  
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
  
  // Update tab counter
  updateTabCounter();
  
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
    // Always show the stored page title or fallback to URL
    const displayTitle = tab.title || tab.url;
    titleElement.textContent = displayTitle;
    titleElement.title = displayTitle;
    
    const closeElement = document.createElement('div');
    closeElement.className = 'tab-close';
    closeElement.innerHTML = '<i class="fas fa-times"></i>';
    closeElement.title = 'Close tab';
    
    tabItem.appendChild(faviconElement);
    tabItem.appendChild(titleElement);
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

// Update navigation buttons state
function updateNavButtons() {
  if (webviewElement.isLoading()) return;
  
  webviewElement.canGoBack().then(canGoBack => {
    backButton.disabled = !canGoBack;
    backButton.style.opacity = canGoBack ? '1' : '0.5';
  });
  
  webviewElement.canGoForward().then(canGoForward => {
    forwardButton.disabled = !canGoForward;
    forwardButton.style.opacity = canGoForward ? '1' : '0.5';
  });
}

// Navigation event handlers
if (backButton) {
  backButton.addEventListener('click', () => {
    if (!backButton.disabled) {
      webviewElement.goBack();
    }
  });
}

if (forwardButton) {
  forwardButton.addEventListener('click', () => {
    if (!forwardButton.disabled) {
      webviewElement.goForward();
    }
  });
}

// Navigation button event listeners
if (backButton) {
  backButton.addEventListener('click', () => {
    const activeWebview = document.querySelector('webview.active');
    if (activeWebview && activeWebview.canGoBack()) {
      activeWebview.goBack();
      logMessage('info', 'Navigating back');
    }
  });
}

if (forwardButton) {
  forwardButton.addEventListener('click', () => {
    const activeWebview = document.querySelector('webview.active');
    if (activeWebview && activeWebview.canGoForward()) {
      activeWebview.goForward();
      logMessage('info', 'Navigating forward');
    }
  });
}

if (closeButton) {
  closeButton.addEventListener('click', () => {
    logMessage('info', 'Close button clicked');
    window.electronAPI.closeApp();
  });
}

if (tabsButton) {
  tabsButton.addEventListener('click', () => {
    const activeWebview = document.querySelector('webview.active');
    if (activeWebview) {
      activeWebview.reload();
      logMessage('info', 'Reloading page');
    }
  });
}

// Update navigation button states for active webview
function updateNavigationButtons() {
  const activeWebview = document.querySelector('webview.active');
  if (activeWebview && activeWebview.getWebContentsId) {
    try {
      backButton.disabled = !activeWebview.canGoBack();
      forwardButton.disabled = !activeWebview.canGoForward();
    } catch (error) {
      // WebView not ready yet, skip update
      console.log('WebView not ready for navigation buttons update');
    }
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
  
  webview.addEventListener('dom-ready', () => {
    if (webview.classList.contains('active')) {
      updateNavigationButtons();
    }
  });
});

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
    // Clear the simulated progress interval
    clearInterval(progressInterval);
    
    // Complete the loading animation
    completeLoadingAnimation();
    
    // Update CSS for active webview
    if (webviewElement.classList.contains('active')) {
      // No CSS injection is performed
    }
  });
  
  // Update tab title and favicon when it changes
  webviewElement.addEventListener('page-title-updated', (event) => {
    const tabIndex = tabs.findIndex(tab => tab.id === webviewElement.id);
    if (tabIndex !== -1) {
      tabs[tabIndex].title = event.title || 'Untitled';
      if (webviewElement.classList.contains('active')) {
        document.title = `${event.title} - NURU Browser`;
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
  webviewElement.addEventListener('did-navigate', () => {
    updateNavigationButtons();
    addHistoryEntry(webviewElement);
  });

  webviewElement.addEventListener('did-navigate-in-page', () => {
    updateNavigationButtons();
    addHistoryEntry(webviewElement);
  });
  
  // Update buttons when page finishes loading
  webviewElement.addEventListener('did-stop-loading', updateNavigationButtons);
  
  // Update buttons when WebView is ready
  webviewElement.addEventListener('dom-ready', updateNavigationButtons);
  
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
if (tabsTriggerArea) {
  tabsTriggerArea.addEventListener('mouseenter', () => {
    clearTimeout(tabsCloseTimer);
    hoverTimer = setTimeout(() => {
      showTabsViewport();
    }, 300);
  });

  tabsTriggerArea.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
  });
}

if (tabsViewport) {
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
}

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

// Initialize the app
async function initializeApp() {
  try {
    // Wait for settings to be loaded first
    await loadSettings();
    
    const cardContainer = document.getElementById('card-container');
    if (!cardContainer) {
      console.error('Card container not found');
      return;
    }
    
    const cardManager = new CardManager(cardContainer);
    cardContainer._cardManager = cardManager;
    
    // Start the startup sequence
    cardManager.startStartupSequence();

    // Fetch and display live weather data
    async function updateWeather() {
    // If we're called without arguments, use the saved location
    if (!settings.cards?.weatherLocation) {
      // Don't interfere with startup sequence
      if (cardManager.startupComplete) {
        cardManager.setCardActive('intro', false);
      }
      return;
    }
    console.log('updateWeather called with weatherLocation:', settings.cards?.weatherLocation);
    const loc = settings.cards?.weatherLocation;
    if (!loc) {
      // Show error in tabs header instead
      updateTabsWeather({ error: true });
      return;
    }
    // Show loading state in tabs header
    updateTabsWeather({ loading: true });
    try {
      // Geocode location
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(loc)}`);
      console.log('Geocoding response status:', geoRes.status);
      const items = await geoRes.json();
      console.log('Geocode items:', items);
      if (!items.length) throw new Error('Location not found');
      const { lat, lon, display_name, name, address } = items[0];
      
      // Extract a shorter, more readable location name
      let shortLocation = name || address?.city || address?.town || address?.village || address?.state || display_name;
      
      // If we still have a very long location, try to extract just the city and state/country
      if (shortLocation && shortLocation.length > 30) {
        const parts = shortLocation.split(',');
        if (parts.length >= 2) {
          // Take first two parts (usually city, state/country)
          shortLocation = parts.slice(0, 2).join(', ').trim();
        } else {
          // If it's still too long, truncate it
          shortLocation = shortLocation.substring(0, 30) + '...';
        }
      }
      
      // Fetch weather from Open-Meteo API
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
      console.log('Weather API response status:', weatherRes.status);
      const weatherData = await weatherRes.json();
      console.log('Weather data:', weatherData);
      if (!weatherData.current_weather) throw new Error('No weather data');
      
      const cTemp = weatherData.current_weather.temperature;
      const tempUnit = settings.cards?.weatherTemperatureUnit || 'celsius';
      let tempStr;
      
      if (tempUnit === 'fahrenheit') {
        const fTemp = (cTemp * 9/5 + 32).toFixed(1);
        tempStr = `${fTemp}°F`;
      } else {
        tempStr = `${cTemp.toFixed(1)}°C`;
      }
      
      // Weather data is now shown in tabs header, not in intro card
      // Update the tabs weather display
      updateTabsWeather({ temp: tempStr, location: shortLocation, iconClass: 'fas fa-cloud-sun' });
    } catch (err) {
      console.error('Weather fetch error', err);
      // Weather errors are handled in tabs header, not intro card
      updateTabsWeather({ error: true });
    }
  }


  // Listen for settings updates and refresh weather
  if (window.electronAPI?.onSettingsUpdated) {
    window.electronAPI.onSettingsUpdated((newSettings) => {
      console.log('Settings updated:', newSettings);
      settings = newSettings;
      applySettings();
      // Only update weather if location changed and startup is complete
      if (newSettings.cards?.weatherLocation) {
        updateWeather();
      }
    });
  }
    
    // Initial weather update if location is set (after startup)
    if (settings.cards?.weatherLocation) {
      console.log('Initial weather update with saved location:', settings.cards.weatherLocation);
      // Wait for startup to complete before updating weather
      setTimeout(() => {
        if (cardManager.startupComplete) {
          updateWeather();
        }
      }, 3500); // Wait 3.5 seconds to ensure startup is complete
    }

    // Refresh weather data every 30 minutes
    const weatherInterval = setInterval(() => {
      if (settings.cards?.weatherLocation) {
        console.log('Refreshing weather data...');
        updateWeather();
      }
    }, 30 * 60 * 1000); // 30 minutes
    
    // Listen for weather update requests (e.g., when temperature unit changes)
    window.addEventListener('weather-update-requested', async () => {
      if (settings.cards?.weatherLocation) {
        await updateWeather();
      }
    });

    // Cleanup interval on page unload
    window.addEventListener('beforeunload', () => {
      clearInterval(weatherInterval);
    });

    // Listen for download events from main process
    if (window.electronAPI) {
      window.electronAPI.onDownloadStart((data) => {
        cardManager.setCardActive('download', true, data);
      });
      window.electronAPI.onDownloadProgress((data) => {
        cardManager.setCardActive('download', true, data);
      });
      window.electronAPI.onDownloadDone(() => {
          cardManager.setCardActive('download', false);
      });
    }
  } catch (error) {
    console.error('Error in initializeApp:', error);
  }
}

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeApp().catch(console.error);
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
if (historyTriggerArea) {
  historyTriggerArea.addEventListener('mouseenter', () => {
    clearTimeout(historyCloseTimer);
    historyHoverTimer = setTimeout(() => {
      if (historyViewport) historyViewport.classList.add('active');
      if (appContainer) appContainer.classList.add('history-open');
      // Hide tabs viewport when history opens
      hideTabsViewport();
    }, 300);
  });
  historyTriggerArea.addEventListener('mouseleave', () => {
    clearTimeout(historyHoverTimer);
  });
}
if (historyViewport) {
  historyViewport.addEventListener('mouseleave', (e) => {
    // Check if we're not moving to the trigger area
    if (e.relatedTarget !== historyTriggerArea) {
      historyCloseTimer = setTimeout(() => {
        historyViewport.classList.remove('active');
        if (appContainer) appContainer.classList.remove('history-open');
        // Re-show tabs viewport unless hidden-by-default is enabled
        if (!settings.viewportsHiddenByDefault) showTabsViewport();
      }, 500);
    }
  });

  // Prevent hover timer from closing viewport if mouse enters back
  historyViewport.addEventListener('mouseenter', () => {
    clearTimeout(historyCloseTimer);
  });
}

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
if (historyList) {
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
        if (historyViewport) historyViewport.classList.remove('active');
        if (appContainer) appContainer.classList.remove('history-open');
      }
    }
  });
}

// Clear all history
if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', () => {
    historyData = [];
    saveHistory();
    renderHistory();
  });
}

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

// Function to update nav buttons and clock visibility based on frameless setting
function updateNavAndClockVisibility() {
  const navButtons = document.querySelector('.tabs-header #nav-buttons');
  const clockContainer = document.querySelector('.tabs-header #tabs-clock-container');
  const tabsTime = document.getElementById('tabs-time');
  const tabsDate = document.getElementById('tabs-date');
  const tabsCounter = document.getElementById('tabs-counter');
  const tabsWeather = document.getElementById('tabs-weather');
  
  if (navButtons && clockContainer) {
    if (settings.frameless) {
      // Frameless mode: show nav buttons and weather, hide clock (toggle is off)
      navButtons.classList.add('show-when-framed');
      clockContainer.classList.add('show-when-framed');
      
      // Show weather, hide clock elements and tab counter
      if (tabsWeather) tabsWeather.style.display = 'flex';
      if (tabsCounter) tabsCounter.style.display = 'none';
      if (tabsTime) tabsTime.style.display = 'none';
      if (tabsDate) tabsDate.style.display = 'none';
    } else {
      // Window frame mode: hide nav buttons and everything (toggle is on)
      navButtons.classList.remove('show-when-framed');
      clockContainer.classList.remove('show-when-framed');
      
      // Hide everything
      if (tabsWeather) tabsWeather.style.display = 'none';
      if (tabsCounter) tabsCounter.style.display = 'none';
      if (tabsTime) tabsTime.style.display = 'none';
      if (tabsDate) tabsDate.style.display = 'none';
    }
  }
}

// Initialize visibility on load
updateNavAndClockVisibility();

// Function to update tab counter
function updateTabCounter() {
  const tabCountElement = document.getElementById('tab-count');
  const tabLabelElement = document.getElementById('tab-label');
  const tabsCountDisplay = document.getElementById('tabs-count-display');
  
  if (tabCountElement && tabLabelElement) {
    const count = tabs.length;
    tabCountElement.textContent = count;
    tabLabelElement.textContent = count === 1 ? 'tab' : 'tabs';
  }
  
  // Update the display next to "Open Tabs"
  if (tabsCountDisplay) {
    tabsCountDisplay.textContent = tabs.length;
  }
}

// Initialize tab counter on load
updateTabCounter();

// Function to activate Quick Actions card for testing
function activateQuickActionsCard() {
  const cardContainer = document.getElementById('card-container');
  if (cardContainer) {
    const cardManager = cardContainer._cardManager || new CardManager(cardContainer);
    cardContainer._cardManager = cardManager;
    cardManager.setCardActive('quickActions', true);
  }
}

// Function to activate Media Player card for testing
function activateMediaPlayerCard() {
  const cardContainer = document.getElementById('card-container');
  if (cardContainer) {
    const cardManager = cardContainer._cardManager || new CardManager(cardContainer);
    cardContainer._cardManager = cardManager;
    cardManager.setCardActive('mediaPlayer', true, {
      title: 'Sample Song',
      artist: 'Sample Artist',
      isPlaying: false,
      duration: 180,
      currentTime: 0
    });
  }
}

// Function to update weather display in tabs header
function updateTabsWeather(data) {
  const tabsWeather = document.getElementById('tabs-weather');
  if (!tabsWeather) return;
  
  const tempEl = tabsWeather.querySelector('.weather-temp');
  const locationEl = tabsWeather.querySelector('.weather-location');
  
  if (data.loading) {
    if (tempEl) tempEl.textContent = '--°';
    if (locationEl) locationEl.textContent = 'Loading...';
  } else if (data.error) {
    if (tempEl) tempEl.textContent = '--°';
    if (locationEl) locationEl.textContent = 'No weather';
  } else {
    if (tempEl) tempEl.textContent = data.temp || '--°';
    if (locationEl) locationEl.textContent = data.location || 'Unknown';
  }
}

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
    
    // Skip unwanted parents
    node.querySelectorAll(allowed.map(tag=>tag.toLowerCase()).join(',')).forEach(el => {
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
  if (mediaSelect) {
    renderResources(mediaSelect.value);
  }
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
    if (!webview || !webview.getWebContentsId) return;
    try {
      webview.executeJavaScript(`!!document.querySelector('article, main')`).then(isArticle => {
        const btn = document.getElementById('reading-mode-btn');
        if (btn) {
          if (isArticle) btn.classList.remove('hidden');
          else btn.classList.add('hidden');
        }
      }).catch(error => {
        // WebView not ready yet, skip detection
        console.log('WebView not ready for reading mode detection');
      });
    } catch (error) {
      // WebView not ready yet, skip detection
      console.log('WebView not ready for reading mode detection');
    }
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
    if (e.ctrlKey && e.key.toLowerCase() === 'd') {
      const toggle = document.querySelector('#show-browser-info-toggle');
      if (toggle) {
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change'));
      }
    }
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

// Pinned Apps Feature
function getPinnedApps() { return JSON.parse(localStorage.getItem('pinnedApps') || '[]'); }
function setPinnedApps(apps) { localStorage.setItem('pinnedApps', JSON.stringify(apps)); }
function renderPinnedApps() {
  const container = document.getElementById('pinned-apps-container');
  if (!container) return;
  container.innerHTML = '';
  getPinnedApps().forEach(url => {
    const hostname = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();
    const origin = (() => { try { return new URL(url).origin; } catch { return ''; } })();
    let iconUrl = '';
    if (origin) {
      const tabEntry = tabs.find(t => {
        try { return new URL(t.url).origin === origin; } catch { return false; }
      });
      iconUrl = (tabEntry && tabEntry.favicon) ? tabEntry.favicon : `${origin}/favicon.ico`;
    }
    const appDiv = document.createElement('div');
    appDiv.className = 'pinned-app'; appDiv.title = hostname;
    const img = document.createElement('img');
    img.src = iconUrl;
    // fallback to default icon on error
    img.onerror = () => {
      img.remove();
      const fallback = document.createElement('i');
      fallback.className = 'fas fa-globe';
      fallback.style.fontSize = '1em';
      appDiv.insertBefore(fallback, appDiv.firstChild);
    };
    appDiv.appendChild(img);
    const unpinIcon = document.createElement('span');
    unpinIcon.className = 'unpin-icon'; unpinIcon.innerHTML = '<i class="fas fa-times"></i>';
    unpinIcon.addEventListener('click', e => {
      e.stopPropagation();
      const filtered = getPinnedApps().filter(u => u !== url);
      setPinnedApps(filtered);
      renderPinnedApps();
      updateTabsUI();
    });
    appDiv.appendChild(unpinIcon);
    appDiv.addEventListener('click', () => navigateToUrl(url));
    container.appendChild(appDiv);
  });
}
const originalUpdateTabsUI = updateTabsUI;
updateTabsUI = function() {
  originalUpdateTabsUI();
  const pinned = getPinnedApps();
  document.querySelectorAll('.tabs-list .tab-item').forEach(item => {
    const tabId = item.dataset.tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    const url = tab.url;
    if (!pinned.includes(url)) {
      const pinBtn = document.createElement('div');
      pinBtn.className = 'tab-pin';
      pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
      pinBtn.title = 'Pin website';
      pinBtn.addEventListener('click', e => {
        e.stopPropagation();
        const newPinned = getPinnedApps(); newPinned.push(url);
        setPinnedApps(newPinned);
        renderPinnedApps();
        updateTabsUI();
      });
      // insert pin button before close button for proper order
      const closeBtn = item.querySelector('.tab-close');
      if (closeBtn) item.insertBefore(pinBtn, closeBtn);
      else item.appendChild(pinBtn);
    }
  });
};
renderPinnedApps();

// Info Cards Manager
class CardManager {
  constructor(container) {
    this.container = container;
    this.cards = {
      intro: { priority: 1, data: {}, active: false, render: this.renderIntro },
      quickActions: { priority: 2, data: {}, active: false, render: this.renderQuickActions },
      mediaPlayer: { priority: 3, data: {}, active: false, render: this.renderMediaPlayer },
      download: { priority: 4, data: {}, active: false, render: this.renderDownload },
      downloadHistory: { priority: 5, data: {}, active: false, render: this.renderDownloadHistory },
      media: { priority: 6, data: {}, active: false, render: this.renderMedia }
    };
    
    // Track startup state
    this.startupComplete = false;
    this.current = null;
    
    // Initialize download state tracking
    this.downloadState = {
      lastProgressTime: Date.now(), // Initialize with current time
      lastReceivedBytes: 0,
      lastUpdate: 0,
      lastRenderTime: 0,
      animationFrame: null,
      currentData: null,
      speedHistory: [],
      averageSpeed: 0 // Initialize to 0 instead of undefined
    };
  }

  setCardActive(type, active, data) {
    if (!this.cards[type]) return;
    this.cards[type].active = active;
    if (data) this.cards[type].data = data;
    this.updateDisplay();
  }
  
  // Startup sequence: show intro for 3 seconds, then quick actions
  startStartupSequence() {
    // Show intro card immediately
    this.setCardActive('intro', true);
    
    // After 2.5 seconds, start exit animation
    setTimeout(() => {
      const container = document.getElementById('card-container');
      if (container && container.classList.contains('intro-card')) {
        container.classList.add('exiting');
      }
    }, 2500);
    
    // After 3 seconds, switch to quick actions
    setTimeout(() => {
      this.setCardActive('intro', false);
      this.setCardActive('quickActions', true);
      this.startupComplete = true;
    }, 3000);
  }

  updateDisplay() {
    // Get all active cards
    const activeCards = Object.entries(this.cards)
      .filter(([_, card]) => card.active);
      
    // If no active cards, clear the container
    if (activeCards.length === 0) {
      return;
    }
    
    // During startup, only show intro card
    if (!this.startupComplete && this.cards.intro.active) {
      this.renderCard('intro', this.cards.intro);
      return;
    }
    
    // After startup, show the highest priority active card
    // But exclude intro card from normal priority system after startup
    const nonIntroCards = activeCards.filter(([cardType, _]) => cardType !== 'intro');
    
    if (nonIntroCards.length > 0) {
      const sortedCards = nonIntroCards.sort((a, b) => a[1].priority - b[1].priority);
      const [cardType, card] = sortedCards[0];
      this.renderCard(cardType, card);
    } else {
      // If no non-intro cards are active, show quick actions as default
      this.renderCard('quickActions', this.cards.quickActions);
    }
  }
  
  renderCard(cardType, card) {
    // Hide all containers first and clean up intro classes
    document.querySelectorAll('.card-container').forEach(container => {
      container.style.display = 'none';
      container.classList.remove('intro-card', 'exiting');
    });
    
    // Each card type has its own container element
    switch(cardType) {
        case 'intro':
          // Intro card shows in card-container
          const introContainer = document.getElementById('card-container');
          if (introContainer) {
            introContainer.style.display = 'flex';
            this.cards[cardType].render.call(this, card.data);
          }
          break;
          
        case 'quickActions':
          // Quick Actions card shows in quick-actions-container
          const quickActionsContainer = document.getElementById('quick-actions-container');
          if (quickActionsContainer) {
            quickActionsContainer.style.display = 'flex';
            this.cards[cardType].render.call(this, card.data);
          }
          break;
          
        case 'mediaPlayer':
          // Media Player card shows in media-player-container
          const mediaPlayerContainer = document.getElementById('media-player-container');
          if (mediaPlayerContainer) {
            mediaPlayerContainer.style.display = 'flex';
            this.cards[cardType].render.call(this, card.data);
          }
          break;
          
        case 'downloadHistory':
          // Download history has its own container
      const downloadHistoryContainer = document.getElementById('download-history-container');
          if (downloadHistoryContainer) {
            this.cards[cardType].render.call(this, card.data);
          }
          break;
          
        case 'download':
          // Current download progress also has its own rendering logic
          this.cards[cardType].render.call(this, card.data);
          break;
          
        default:
          // For other cards, fallback to old behavior using the main container
          this.cards[cardType].render.call(this, card.data);
      }
  }

  renderIntro(data) {
    const container = document.getElementById('card-container');
    if (!container) return;
    
    const appLogo = document.getElementById('app-logo');

    // Add intro card class for animations
    container.classList.add('intro-card');
    container.classList.remove('exiting');

    // Show the container with centered logo
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    
    if (appLogo) {
      appLogo.style.display = 'block';
    }
    
    // Also update the tabs weather display
    updateTabsWeather(data);
  }
  
  renderQuickActions(data) {
    const container = document.getElementById('quick-actions-container');
    if (!container) return;
    
    // Set up event listeners for quick action buttons
    this.setupQuickActionListeners();
  }
  
  renderMediaPlayer(data) {
    const container = document.getElementById('media-player-container');
    if (!container) return;
    
    // Update media player with current data
    this.updateMediaPlayer(data);
  }
  
  setupQuickActionListeners() {
    // New Tab
    const newTabBtn = document.getElementById('quick-new-tab');
    if (newTabBtn) {
      newTabBtn.addEventListener('click', () => {
        createTab();
        showNotification('New tab created', 'success');
      });
    }
    
    // Bookmark Page
    const bookmarkBtn = document.getElementById('quick-bookmark');
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', () => {
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview) {
          activeWebview.executeJavaScript(`
            const title = document.title;
            const url = window.location.href;
            window.electronAPI.addBookmark({ title, url });
          `);
          showNotification('Page bookmarked', 'success');
        }
      });
    }
    
    // Screenshot
    const screenshotBtn = document.getElementById('quick-screenshot');
    if (screenshotBtn) {
      screenshotBtn.addEventListener('click', () => {
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview) {
          activeWebview.capturePage().then(image => {
            // Convert to data URL and trigger download
            const dataUrl = image.toDataURL();
            const link = document.createElement('a');
            link.download = `screenshot-${Date.now()}.png`;
            link.href = dataUrl;
            link.click();
            showNotification('Screenshot saved', 'success');
          });
        }
      });
    }
    
    // Reading Mode
    const readingBtn = document.getElementById('quick-reading-mode');
    if (readingBtn) {
      readingBtn.addEventListener('click', () => {
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview) {
          activeWebview.executeJavaScript('(' + __nuruInjectReadingMode.toString() + ')()')
            .catch(err => console.error('Reading mode injection failed:', err));
          showNotification('Reading mode activated', 'success');
        }
      });
    }
    
    // Clear Cache
    const clearCacheBtn = document.getElementById('quick-clear-cache');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.clearCache) {
          window.electronAPI.clearCache();
          showNotification('Cache cleared', 'success');
        }
      });
    }
    
    // Refresh Page
    const refreshBtn = document.getElementById('quick-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        const activeWebview = document.querySelector('webview.active');
        if (activeWebview) {
          activeWebview.reload();
          showNotification('Page refreshed', 'success');
        }
      });
    }
  }
  
  updateMediaPlayer(data) {
    const titleEl = document.querySelector('#media-player-container .media-title');
    const artistEl = document.querySelector('#media-player-container .media-artist');
    const playPauseBtn = document.getElementById('media-play-pause');
    const progressFill = document.querySelector('#media-player-container .progress-fill');
    const currentTimeEl = document.querySelector('#media-player-container .current-time');
    const totalTimeEl = document.querySelector('#media-player-container .total-time');
    
    if (data.title) {
      if (titleEl) titleEl.textContent = data.title;
      if (artistEl) artistEl.textContent = data.artist || 'Unknown Artist';
    } else {
      if (titleEl) titleEl.textContent = 'No media playing';
      if (artistEl) artistEl.textContent = 'Nuru Browser';
    }
    
    // Update play/pause button
    if (playPauseBtn) {
      const icon = playPauseBtn.querySelector('i');
      if (data.isPlaying) {
        if (icon) icon.className = 'fas fa-pause';
      } else {
        if (icon) icon.className = 'fas fa-play';
      }
    }
    
    // Update progress
    if (data.duration && data.currentTime) {
      const progress = (data.currentTime / data.duration) * 100;
      if (progressFill) progressFill.style.width = `${progress}%`;
      if (currentTimeEl) currentTimeEl.textContent = this.formatTime(data.currentTime);
      if (totalTimeEl) totalTimeEl.textContent = this.formatTime(data.duration);
    } else {
      if (progressFill) progressFill.style.width = '0%';
      if (currentTimeEl) currentTimeEl.textContent = '0:00';
      if (totalTimeEl) totalTimeEl.textContent = '0:00';
    }
  }
  
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  renderDownloadHistory(data) {
    const downloadHistoryContainer = document.getElementById('download-history-container');
    const downloadHistoryList = document.getElementById('download-history-list');
    if (!downloadHistoryContainer || !downloadHistoryList) return;
    
    // Make sure the download history container is visible without affecting others
    downloadHistoryContainer.style.display = 'block';
    
    // Ensure the container for cards is properly positioned
    const tabsList = document.getElementById('tabs-list');
    if (tabsList) {
      // Add a margin to push down the tabs list
      tabsList.style.marginTop = '10px';
    }
    
    // Clear any existing entries
    downloadHistoryList.innerHTML = '';
    
    if (!data || data.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'download-history-item';
      emptyItem.textContent = 'No downloads yet';
      downloadHistoryList.appendChild(emptyItem);
      return;
    }
    
    // Sort downloads by timestamp (newest first)
    const sortedData = [...data].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    // Add each download to the list
    sortedData.forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'download-history-item';
      
      // Format the date nicely
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleString();
      
      // Try to extract filename from URL
      let filename = '';
      try {
        const url = new URL(item.url);
        filename = url.pathname.split('/').pop() || item.url;
      } catch (e) {
        filename = item.url;
      }
      
      historyItem.textContent = `${formattedDate} - ${filename}`;
      historyItem.title = item.url; // Show full URL on hover
      
      downloadHistoryList.appendChild(historyItem);
    });
  }

  // Smoothing function for download speed using exponential moving average (EMA)
  updateSpeed(speed) {
    const { speedHistory } = this.downloadState;
    
    // Use a smoothing factor (0.3 = more smoothing, 0.7 = more responsive)
    const smoothingFactor = 0.5;
    
    // If we have previous average, calculate EMA
    if (this.downloadState.averageSpeed !== undefined) {
      this.downloadState.averageSpeed = 
        (speed * smoothingFactor) + 
        (this.downloadState.averageSpeed * (1 - smoothingFactor));
    } else {
      // First time, just use the current speed
      this.downloadState.averageSpeed = speed;
    }
    
    // Store last few speeds for reference (but they don't affect the average)
    speedHistory.push(speed);
    if (speedHistory.length > 5) {
      speedHistory.shift();
    }
  }

  // Throttled render function
  scheduleRender(data) {
    const now = Date.now();
    const minRenderInterval = 200; // Increased to 200ms for smoother updates
    
    // Always update the latest data
    this.downloadState.currentData = { ...data };
    
    // If we already have a render scheduled, keep it
    if (this.downloadState.animationFrame) {
      return;
    }
    
    // Calculate time since last render
    const timeSinceLastRender = now - this.downloadState.lastRenderTime;
    
    // Always use requestAnimationFrame for smoother animations
    this.downloadState.animationFrame = requestAnimationFrame(() => {
      // If not enough time has passed since last render, schedule for later
      if (timeSinceLastRender < minRenderInterval) {
        const timeToNextRender = minRenderInterval - timeSinceLastRender;
        setTimeout(() => {
          this._renderDownload(this.downloadState.currentData);
          this.downloadState.animationFrame = null;
          this.downloadState.lastRenderTime = Date.now();
        }, timeToNextRender);
      } else {
        // If enough time has passed, render immediately
        this._renderDownload(this.downloadState.currentData);
        this.downloadState.animationFrame = null;
        this.downloadState.lastRenderTime = now;
      }
    });
  }

  // Main render function
  renderDownload(data) {
    const now = Date.now();
    const elapsed = now - this.downloadState.lastProgressTime;
    
    // Always update the received bytes for accurate progress tracking
    const downloaded = data.receivedBytes - this.downloadState.lastReceivedBytes;
    
    // Update speed if we have previous data and enough time has passed
    if (elapsed > 100) {
      const speed = elapsed > 0 ? (downloaded / elapsed) * 1000 : 0; // bytes per second
      this.updateSpeed(speed);
      
      // Update tracking variables
      this.downloadState.lastProgressTime = now;
      this.downloadState.lastReceivedBytes = data.receivedBytes;
    } else if (downloaded > 0) {
      // For the first update or very quick updates, calculate an initial speed
      const initialSpeed = (downloaded / Math.max(1, elapsed)) * 1000;
      this.updateSpeed(initialSpeed);
    }
    
    // Always use the latest data, but with our smoothed speed
    this.scheduleRender({
      ...data,
      speed: this.downloadState.averageSpeed
    });
  }

  // Format file size helper
  formatBytes(bytes, decimals) {
    decimals = decimals || 2;
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Format time remaining helper
  formatTimeRemaining(bytes, total, speed) {
    // If we don't have valid data yet, show calculating
    if (speed <= 0 || bytes <= 0 || total <= 0) return 'Calculating...';
    
    const remainingBytes = total - bytes;
    // If download is complete or nearly complete
    if (remainingBytes <= 0) return 'Almost done...';
    
    // Calculate seconds remaining with a minimum of 1 second
    let seconds = Math.max(1, Math.ceil(remainingBytes / speed));
    
    // Handle edge cases
    if (isNaN(seconds) || !isFinite(seconds)) return 'Calculating...';
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    // Format the time remaining
    if (h > 0) return `${h}h ${m}m remaining`;
    if (m > 0) return `${m}m ${s}s remaining`;
    return `${s}s remaining`;
  }

  // Update progress bar smoothly
  updateProgressBar(percent) {
    var progressBar = this.container.querySelector('.progress-bar');
    if (progressBar) {
      // Use width instead of transform for better compatibility
      progressBar.style.width = percent + '%';
    }
  }

  // Render media controls
  renderMedia() {
    this.container.innerHTML = [
      '<div class="media-card">',
        '<div class="media-controls">',
          '<button class="media-control">⏮</button>',
          '<button class="media-control">⏯</button>',
          '<button class="media-control">⏭</button>',
        '</div>',
      '</div>'
    ].join('');
  }

  // Update only the dynamic parts of the UI
  updateDownloadUI(data) {
    var progressBar = this.container.querySelector('.progress-bar');
    var sizeEl = this.container.querySelector('.download-size');
    var speedEl = this.container.querySelector('.download-speed');
    var timeEl = this.container.querySelector('.download-time');
    
    // Only update progress bar if it exists and the value changed
    if (progressBar) {
      this.updateProgressBar(data.percent);
    }
    
    // Update text elements
    if (sizeEl) {
      sizeEl.textContent = this.formatBytes(data.receivedBytes) + ' / ' + this.formatBytes(data.totalBytes);
    }
    
    if (speedEl) {
      speedEl.textContent = data.speed > 0 ? this.formatBytes(data.speed) + '/s' : '';
    }
    
    if (timeEl) {
      timeEl.textContent = this.formatTimeRemaining(data.receivedBytes, data.totalBytes, data.speed);
    }
  }

  // Actual DOM update function
  _renderDownload(data) {
    // Determine status text and icon
    var statusText = 'Downloading...';
    var statusIcon = '⏬';
    var progressClass = '';
    
    if (data.state === 'completed') {
      statusText = 'Download completed';
      statusIcon = '✓';
      progressClass = 'completed';
    } else if (data.state === 'interrupted' || data.state === 'cancelled') {
      statusText = data.state === 'cancelled' ? 'Download cancelled' : 'Download failed';
      statusIcon = '✗';
      progressClass = 'error';
    }

    // Check if this is the first render or if the card doesn't exist yet
    var existingCard = this.container.querySelector('.download-card');
    
    if (!existingCard) {
      // First render - create the full card
      var newHTML = [
        '<div class="download-card ' + progressClass + '" data-id="' + data.id + '">',
          '<div class="download-header">',
            '<span class="download-status">' + statusIcon + '</span>',
            '<span class="download-status-text">' + statusText + '</span>',
            '<button class="download-cancel" title="Cancel download">Cancel</button>',
          '</div>',
          '<div class="download-filename" title="' + data.filename + '">' + data.filename + '</div>',
          '<div class="progress-container">',
            '<div class="progress-bar" style="width: ' + data.percent + '%"></div>',
          '</div>',
          '<div class="download-details">',
            '<span class="download-size">' + this.formatBytes(data.receivedBytes) + ' / ' + this.formatBytes(data.totalBytes) + '</span>',
            '<span class="download-speed">' + (data.speed > 0 ? this.formatBytes(data.speed) + '/s' : '') + '</span>',
            '<span class="download-time">' + this.formatTimeRemaining(data.receivedBytes, data.totalBytes, data.speed) + '</span>',
          '</div>',
        '</div>'
      ].join('');
      
      this.container.innerHTML = newHTML;
      
      // Add cancel button event listener
      var cancelBtn = this.container.querySelector('.download-cancel');
      if (cancelBtn) {
        var self = this;
        cancelBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          
          // Create confirmation dialog
          var confirmDialog = document.createElement('div');
          confirmDialog.className = 'download-cancel-confirm';
          confirmDialog.innerHTML = [
            '<div class="download-cancel-confirm-content">',
            '  <h3>Cancel download</h3>',
            '  <p>Are you sure?</p>',
            '  <div class="download-cancel-confirm-buttons">',
            '    <button class="download-cancel-no">No</button>',
            '    <button class="download-cancel-yes">Yes</button>',
            '  </div>',
            '</div>'
          ].join('');
          
          // Add dialog to the card
          var downloadCard = self.container.querySelector('.download-card');
          downloadCard.appendChild(confirmDialog);
          
          // Add event listeners for confirmation buttons
          var yesBtn = confirmDialog.querySelector('.download-cancel-yes');
          var noBtn = confirmDialog.querySelector('.download-cancel-no');
          
          yesBtn.addEventListener('click', function() {
            if (window.electronAPI && window.electronAPI.cancelDownload) {
              window.electronAPI.cancelDownload(data.id);
              self.setCardActive('download', false);
            }
            confirmDialog.remove();
          });
          
          noBtn.addEventListener('click', function() {
            confirmDialog.remove();
          });
        });
      }
    } else {
      // Update existing card
      if (existingCard.className !== 'download-card ' + progressClass) {
        existingCard.className = 'download-card ' + progressClass;
      }
      
      // Update status if changed
      var statusEl = existingCard.querySelector('.download-status');
      var statusTextEl = existingCard.querySelector('.download-status-text');
      
      if (statusEl) statusEl.textContent = statusIcon;
      if (statusTextEl) statusTextEl.textContent = statusText;
      
      // Update dynamic content
      this.updateDownloadUI(data);
    }

    // Auto-hide after completion with delay
    if (data.state === 'completed') {
      var self = this;
      setTimeout(function() {
        if (self.current === 'download') {
          self.setCardActive('download', false);
        }
      }, 3000);
    }
  }


}

const downloadHistoryBtn = document.getElementById('download-history-btn');
const clearDownloadHistoryBtn = document.getElementById('clear-download-history-btn');
const downloadHistoryContainer = document.getElementById('download-history-container');
const downloadHistoryList = document.getElementById('download-history-list');

// Track download history visibility locally
let downloadHistoryVisible = false;

// Function to toggle download history visibility
function toggleDownloadHistory() {
  console.log('Toggle download history called');
  const cardContainer = document.getElementById('card-container');
  if (!cardContainer) {
    console.error('Card container not found');
    return;
  }
  
  const cardManager = cardContainer._cardManager || new CardManager(cardContainer);
  cardContainer._cardManager = cardManager;
  
  downloadHistoryVisible = !downloadHistoryVisible;
  console.log('Download history visible:', downloadHistoryVisible);
  
  if (downloadHistoryVisible) {
    // Get the download history and show it
    console.log('Attempting to get download history');
    if (!window.electronAPI || !window.electronAPI.getDownloadHistory) {
      console.error('getDownloadHistory method not available on electronAPI');
      console.log('Available methods:', Object.keys(window.electronAPI || {}));
      return;
    }
    
    window.electronAPI.getDownloadHistory()
      .then(data => {
        console.log('Download history received:', data);
        cardManager.setCardActive('downloadHistory', true, data);
      })
      .catch(err => console.error('Error getting download history:', err));
  } else {
    cardManager.setCardActive('downloadHistory', false);
    
    // Reset the tabs list margin when closing
    const tabsList = document.getElementById('tabs-list');
    if (tabsList) {
      tabsList.style.marginTop = '0';
    }
    
    // Hide the download history container
    const downloadHistoryContainer = document.getElementById('download-history-container');
    if (downloadHistoryContainer) {
      downloadHistoryContainer.style.display = 'none';
    }
  }
}

// Set up download history button click handler
if (downloadHistoryBtn) {
  downloadHistoryBtn.addEventListener('click', toggleDownloadHistory);
}

// Set up settings button click handler
if (settingsBtn) {
  settingsBtn.addEventListener('click', showSettingsViewport);
}

// Set up close button click handler
const closeDownloadHistoryBtn = document.getElementById('close-download-history-btn');
if (closeDownloadHistoryBtn) {
  closeDownloadHistoryBtn.addEventListener('click', toggleDownloadHistory);
}

if (clearDownloadHistoryBtn) {
  clearDownloadHistoryBtn.addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.clearDownloadHistory) {
      window.electronAPI.clearDownloadHistory()
        .then(() => {
          console.log('Download history cleared successfully');
          // Clear the local display
          downloadHistoryList.innerHTML = '';
          const emptyItem = document.createElement('div');
          emptyItem.className = 'download-history-item';
          emptyItem.textContent = 'No downloads yet';
          downloadHistoryList.appendChild(emptyItem);
        })
        .catch(err => console.error('Error clearing download history:', err));
    } else {
      console.error('clearDownloadHistory method not available');
    }
  });
}

// Download history show/hide handlers
if (window.electronAPI.onShowDownloadHistoryCard) {
  window.electronAPI.onShowDownloadHistoryCard((data) => {
    const cardContainer = document.getElementById('card-container');
    if (cardContainer) {
      const cardManager = cardContainer._cardManager || new CardManager(cardContainer);
      cardContainer._cardManager = cardManager;
      cardManager.setCardActive('downloadHistory', true, data);
    }
  });
}

// Listen for download history updates while the card is open
if (window.electronAPI.onDownloadHistoryUpdated) {
  window.electronAPI.onDownloadHistoryUpdated((data) => {
    console.log('Download history updated event received', data);
    const cardContainer = document.getElementById('card-container');
    const downloadHistoryContainer = document.getElementById('download-history-container');
    
    // Only update if the download history container is visible
    if (cardContainer && downloadHistoryContainer && 
        downloadHistoryContainer.style.display !== 'none') {
      const cardManager = cardContainer._cardManager || new CardManager(cardContainer);
      cardContainer._cardManager = cardManager;
      
      // Update the card with new data
      cardManager.setCardActive('downloadHistory', true, data);
    }
  });
}

if (window.electronAPI.onHideDownloadHistoryCard) {
  window.electronAPI.onHideDownloadHistoryCard(() => {
    const cardContainer = document.getElementById('card-container');
    if (cardContainer) {
      const cardManager = cardContainer._cardManager || new CardManager(cardContainer);
      cardContainer._cardManager = cardManager;
      cardManager.setCardActive('downloadHistory', false);
    }
  });
}

// Settings Viewport Functions - Top Sliding Full Screen
const settingsViewport = document.querySelector('.settings-viewport');
const settingsContent = document.getElementById('settings-content');
const closeSettingsBtn = document.getElementById('close-settings-btn');

function showSettingsViewport() {
  if (!settingsViewport) {
    console.error('settingsViewport not found!');
    return;
  }
  
  if (!settingsContent) {
    console.error('settingsContent not found!');
    return;
  }
  
  // Initialize settings functionality
  initializeSettingsContent();
  
  settingsViewport.classList.add('active');
  appContainer.classList.add('settings-open');
  
  logMessage('info', 'Settings viewport opened');
}

function hideSettingsViewport() {
  if (!settingsViewport) return;
  settingsViewport.classList.remove('active');
  appContainer.classList.remove('settings-open');
  
  logMessage('info', 'Settings viewport closed');
}

async function loadSettingsContent() {
  try {
    const response = await fetch('settings-content.html');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const content = await response.text();
    settingsContent.innerHTML = content;
    
    // Initialize settings functionality
    initializeSettingsContent();
  } catch (error) {
    console.error('Failed to load settings content:', error);
    settingsContent.innerHTML = '<div class="error">Failed to load settings content: ' + error.message + '</div>';
  }
}

function initializeSettingsContent() {
  // Navigation
  const navItems = settingsContent.querySelectorAll('.nav-item');
  const contentSections = settingsContent.querySelectorAll('.content-section');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.getAttribute('data-section');
      
      // Update active nav item
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Show corresponding section
      contentSections.forEach(sec => sec.classList.remove('active'));
      const targetSection = settingsContent.querySelector(`#${section}-section`);
      if (targetSection) targetSection.classList.add('active');
    });
  });
  
  // Initialize form controls with current settings
  initializeSettingsForm();
  
  // Add event listeners
  addSettingsEventListeners();
}

function initializeSettingsForm() {
  // Zoom slider
  const zoomSlider = settingsContent.querySelector('#zoom-slider');
  const zoomValue = settingsContent.querySelector('#zoom-value');
  if (zoomSlider && zoomValue) {
    zoomSlider.value = settings.zoom_factor || 1;
    zoomValue.textContent = `${settings.zoom_factor || 1}x`;
  }
  
  // Restore last page toggle
  const restoreToggle = settingsContent.querySelector('#restore-last-page-toggle');
  if (restoreToggle) {
    restoreToggle.checked = settings.restoreLastPage || false;
  }
  
  // Search engine select
  const seSelect = settingsContent.querySelector('#search-engine-select');
  const seCustom = settingsContent.querySelector('#search-engine-custom-input');
  if (seSelect) {
    const presets = {
      google: 'https://www.google.com/search?q=',
      bing: 'https://www.bing.com/search?q=',
      duckduckgo: 'https://duckduckgo.com/?q=',
      yahoo: 'https://search.yahoo.com/search?p='
    };
    
    const seEntry = settings.search_engine || {};
    const seMatch = Object.entries(presets).find(([, url]) => url === seEntry.url);
    if (seMatch) {
      seSelect.value = seMatch[0];
    } else {
      seSelect.value = 'custom';
      if (seCustom) {
        seCustom.style.display = 'block';
        seCustom.value = seEntry.url || '';
      }
    }
  }
  
  // Homepage select
  const hpSelect = settingsContent.querySelector('#homepage-select');
  const hpCustom = settingsContent.querySelector('#homepage-custom-input');
  if (hpSelect) {
    const hpPresets = ['nuru://start','https://www.google.com/','https://www.bing.com/','https://duckduckgo.com/','https://search.yahoo.com/'];
    if (hpPresets.includes(settings.homepage)) {
      hpSelect.value = settings.homepage;
    } else {
      hpSelect.value = 'custom';
      if (hpCustom) {
        hpCustom.style.display = 'block';
        hpCustom.value = settings.homepage || '';
      }
    }
  }
  
  // Theme select
  const themeSelect = settingsContent.querySelector('#theme-select');
  if (themeSelect) {
    themeSelect.value = settings.theme || 'dark';
  }
  
  // Viewports hidden toggle
  const viewportsToggle = settingsContent.querySelector('#viewports-hidden-toggle');
  if (viewportsToggle) {
    viewportsToggle.checked = settings.viewportsHiddenByDefault || false;
  }
  
  // Weather location
  const weatherInput = settingsContent.querySelector('#weather-location-input');
  if (weatherInput) {
    weatherInput.value = settings.cards?.weatherLocation || '';
  }
  
  // Weather temperature unit
  const weatherTempUnitSelect = settingsContent.querySelector('#weather-temperature-unit-select');
  if (weatherTempUnitSelect) {
    weatherTempUnitSelect.value = settings.cards?.weatherTemperatureUnit || 'celsius';
  }
  
  // Ad blocking
  const adblockToggle = settingsContent.querySelector('#adblock-toggle');
  if (adblockToggle) {
    adblockToggle.checked = settings.features?.adblock || false;
  }
  
  
  // Development mode
  const devModeToggle = settingsContent.querySelector('#development-mode-toggle');
  if (devModeToggle) {
    devModeToggle.checked = settings.development_mode || false;
  }
  
  // Frameless (inverted logic: checked = show frame, unchecked = frameless)
  const framelessToggle = settingsContent.querySelector('#frameless-toggle');
  if (framelessToggle) {
    framelessToggle.checked = !settings.frameless;
  }
  
  // Remember window state
  const rememberWindowStateToggle = settingsContent.querySelector('#remember-window-state-toggle');
  if (rememberWindowStateToggle) {
    rememberWindowStateToggle.checked = settings.rememberWindowState !== false;
  }
  
  
  
  // Autofill enabled
  const autofillToggle = settingsContent.querySelector('#autofill-enabled-toggle');
  if (autofillToggle) {
    autofillToggle.checked = settings.autofillEnabled !== false;
  }
}

function addSettingsEventListeners() {
  // Zoom slider
  const zoomSlider = settingsContent.querySelector('#zoom-slider');
  const zoomValue = settingsContent.querySelector('#zoom-value');
  if (zoomSlider && zoomValue) {
    zoomSlider.addEventListener('input', async (e) => {
      const value = parseFloat(e.target.value);
      zoomValue.textContent = `${value}x`;
      settings.zoom_factor = value;
      applySettings();
      
      // Save immediately and show notification
      try {
        await window.electronAPI.updateSettings(settings);
        showNotification('Settings Saved', 'Zoom level updated', 'success');
      } catch (error) {
        showNotification('Error', 'Failed to save zoom setting', 'error');
      }
    });
  }
  
  // Restore last page toggle
  const restoreToggle = settingsContent.querySelector('#restore-last-page-toggle');
  if (restoreToggle) {
    restoreToggle.addEventListener('change', async (e) => {
      settings.restoreLastPage = e.target.checked;
      
      // Save immediately and show notification
      try {
        await window.electronAPI.updateSettings(settings);
        showNotification('Settings Saved', 'Startup behavior updated', 'success');
      } catch (error) {
        showNotification('Error', 'Failed to save startup setting', 'error');
      }
    });
  }
  
  // Search engine select
  const seSelect = settingsContent.querySelector('#search-engine-select');
  const seCustom = settingsContent.querySelector('#search-engine-custom-input');
  if (seSelect) {
    seSelect.addEventListener('change', async (e) => {
      if (e.target.value === 'custom') {
        if (seCustom) seCustom.style.display = 'block';
      } else {
        if (seCustom) seCustom.style.display = 'none';
        const presets = {
          google: 'https://www.google.com/search?q=',
          bing: 'https://www.bing.com/search?q=',
          duckduckgo: 'https://duckduckgo.com/?q=',
          yahoo: 'https://search.yahoo.com/search?p='
        };
        settings.search_engine = { name: e.target.value, url: presets[e.target.value] };
        
        // Save immediately and show notification
        try {
          await window.electronAPI.updateSettings(settings);
          showNotification('Settings Saved', 'Search engine updated', 'success');
        } catch (error) {
          showNotification('Error', 'Failed to save search engine setting', 'error');
        }
      }
    });
  }
  
  // Homepage select
  const hpSelect = settingsContent.querySelector('#homepage-select');
  const hpCustom = settingsContent.querySelector('#homepage-custom-input');
  if (hpSelect) {
    hpSelect.addEventListener('change', async (e) => {
      if (e.target.value === 'custom') {
        if (hpCustom) hpCustom.style.display = 'block';
      } else {
        if (hpCustom) hpCustom.style.display = 'none';
        settings.homepage = e.target.value;
        
        // Save immediately and show notification
        try {
          await window.electronAPI.updateSettings(settings);
          showNotification('Settings Saved', 'Homepage updated', 'success');
        } catch (error) {
          showNotification('Error', 'Failed to save homepage setting', 'error');
        }
      }
    });
  }
  
  // Theme select
  const themeSelect = settingsContent.querySelector('#theme-select');
  if (themeSelect) {
    themeSelect.addEventListener('change', async (e) => {
      settings.theme = e.target.value;
      applySettings();
      
      // Save immediately and show notification
      try {
        await window.electronAPI.updateSettings(settings);
        showNotification('Settings Saved', 'Theme updated', 'success');
      } catch (error) {
        showNotification('Error', 'Failed to save theme setting', 'error');
      }
    });
  }
  
  // Viewports hidden toggle
  const viewportsToggle = settingsContent.querySelector('#viewports-hidden-toggle');
  if (viewportsToggle) {
    viewportsToggle.addEventListener('change', async (e) => {
      settings.viewportsHiddenByDefault = e.target.checked;
      
      // Save immediately and show notification
      try {
        await window.electronAPI.updateSettings(settings);
        showNotification('Settings Saved', 'Layout options updated', 'success');
      } catch (error) {
        showNotification('Error', 'Failed to save layout setting', 'error');
      }
    });
  }
  
  // Weather location
  const weatherInput = settingsContent.querySelector('#weather-location-input');
  const weatherSaveBtn = settingsContent.querySelector('#weather-save-btn');
  const detectLocationBtn = settingsContent.querySelector('#detect-location-btn');
  const locationStatus = settingsContent.querySelector('#location-status');
  
  if (weatherInput && weatherSaveBtn) {
    weatherSaveBtn.addEventListener('click', async () => {
      const loc = weatherInput.value.trim();
      settings.cards = { ...settings.cards, weatherLocation: loc };
      
      // Save immediately and show notification
      try {
        await window.electronAPI.updateSettings(settings);
        showNotification('Weather location saved', 'success');
      } catch (error) {
        showNotification('Error', 'Failed to save weather location', 'error');
      }
    });
  }
  
  // Weather temperature unit
  const weatherTempUnitSelect = settingsContent.querySelector('#weather-temperature-unit-select');
  if (weatherTempUnitSelect) {
    weatherTempUnitSelect.addEventListener('change', async (e) => {
      settings.cards = { ...settings.cards, weatherTemperatureUnit: e.target.value };
      
      // Save immediately and show notification
      try {
        const result = await window.electronAPI.updateSettings(settings);
        // updateSettings returns the settings object, not a result object
        if (result) {
          showNotification('Temperature unit updated', 'success');
          
          // Update weather display if weather is currently shown
          if (settings.cards?.weatherLocation) {
            try {
              await updateWeather();
            } catch (weatherError) {
              console.log('Weather update failed, but temperature unit was saved:', weatherError);
              // Don't show error for weather update failure, just log it
            }
          }
        } else {
          showNotification('Error', 'Failed to save temperature unit', 'error');
        }
      } catch (error) {
        console.error('Temperature unit save error:', error);
        showNotification('Error', 'Failed to save temperature unit', 'error');
      }
    });
  }

  // Location detection functionality
  if (detectLocationBtn && weatherInput && locationStatus) {
    detectLocationBtn.addEventListener('click', async () => {
      // Show loading state
      detectLocationBtn.disabled = true;
      detectLocationBtn.innerHTML = '<span class="button-icon">⏳</span>Detecting...';
      locationStatus.style.display = 'block';
      locationStatus.className = 'location-status loading';
      locationStatus.textContent = 'Detecting your location...';

      try {
        // Check geolocation support
        if (!navigator.geolocation) {
          throw new Error('Geolocation is not supported by this browser');
        }

        console.log('Starting location detection...');
        
        // Check if we have permission to access geolocation
        if (navigator.permissions) {
          try {
            const permission = await navigator.permissions.query({ name: 'geolocation' });
            console.log('Geolocation permission state:', permission.state);
            
            if (permission.state === 'denied') {
              throw new Error('Location access has been denied. Please check your browser settings and allow location access for this site.');
            }
          } catch (permError) {
            console.warn('Could not check geolocation permission:', permError);
            // Continue anyway, as some browsers don't support the permissions API
          }
        }
        
        // Get user's current position with multiple fallback strategies
        const position = await new Promise((resolve, reject) => {
          let attempts = 0;
          const maxAttempts = 2;
          
          const tryGeolocation = (options) => {
            attempts++;
            
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                console.log('Geolocation successful:', pos);
                resolve(pos);
              },
              (error) => {
                // Only log the final failure, not intermediate attempts
                if (attempts >= maxAttempts) {
                  console.warn('All geolocation attempts failed, trying fallback methods...');
                }
                
                // If this is the first attempt and it's a network error or timeout, try with different options
                if (attempts < maxAttempts && (error.code === 2 || error.code === 3)) {
                  console.log('Retrying with different geolocation options...');
                  // Try with even more conservative options
                  tryGeolocation({
                    enableHighAccuracy: false,
                    timeout: 5000, // Very short timeout for retry
                    maximumAge: 0 // Don't use cache on retry
                  });
                  return;
                }
                
                // Provide more specific error messages
                if (error.code === 1) {
                  reject(new Error('Location access denied. Please click "Allow" when prompted for location access, or check your browser settings.'));
                } else if (error.code === 2) {
                  reject(new Error('Location unavailable. This may be due to network issues or location services being disabled on your system. You can still enter your location manually.'));
                } else if (error.code === 3) {
                  reject(new Error('Location request timed out. Please try again.'));
                } else {
                  reject(new Error(`Location detection failed: ${error.message || 'Unknown error'}`));
                }
              },
              options
            );
          };
          
          // Start with very conservative options for better compatibility
          tryGeolocation({
            enableHighAccuracy: false,
            timeout: 10000, // Shorter timeout for first attempt
            maximumAge: 0 // Don't use cache initially
          });
        });

        const { latitude, longitude } = position.coords;
        console.log(`Location detected: ${latitude}, ${longitude}`);
        
        // Show reverse geocoding status
        locationStatus.className = 'location-status loading';
        locationStatus.textContent = 'Converting coordinates to address...';

        // Reverse geocode coordinates to get readable location
        console.log('Reverse geocoding coordinates...');
        const reverseGeoResponse = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`
        );
        
        if (!reverseGeoResponse.ok) {
          console.error('Reverse geocoding failed:', reverseGeoResponse.status, reverseGeoResponse.statusText);
          throw new Error(`Failed to reverse geocode location (${reverseGeoResponse.status})`);
        }

        const reverseGeoData = await reverseGeoResponse.json();
        console.log('Reverse geocoding result:', reverseGeoData);
        
        if (!reverseGeoData || !reverseGeoData.display_name) {
          throw new Error('Could not determine location from coordinates');
        }

        // Extract a readable location name
        const address = reverseGeoData.address;
        let locationName = '';
        
        if (address) {
          // Try to build a nice location string
          const parts = [];
          if (address.city) parts.push(address.city);
          else if (address.town) parts.push(address.town);
          else if (address.village) parts.push(address.village);
          
          if (address.state) parts.push(address.state);
          else if (address.county) parts.push(address.county);
          
          if (address.country) parts.push(address.country);
          
          locationName = parts.join(', ');
        }
        
        // Fallback to display_name if we couldn't build a nice name
        if (!locationName) {
          locationName = reverseGeoData.display_name;
        }

        // Update the input field
        weatherInput.value = locationName;
        
        // Show success status
        locationStatus.className = 'location-status success';
        locationStatus.textContent = `Location detected: ${locationName}`;
        
        // Auto-save the detected location
        settings.cards = { ...settings.cards, weatherLocation: locationName };
        try {
          await window.electronAPI.updateSettings(settings);
          showNotification('Location detected and saved', 'success');
        } catch (error) {
          showNotification('Error', 'Failed to save detected location', 'error');
        }

      } catch (error) {
        // Try IP-based geolocation as a fallback for any geolocation failure
        locationStatus.className = 'location-status loading';
        locationStatus.textContent = 'Trying alternative location detection...';
        
        let fallbackSucceeded = false;
        
        try {
          // Try multiple IP-based geolocation services for better reliability
          const ipServices = [
            'https://ipapi.co/json/',
            'https://ipinfo.io/json',
            'https://api.ipgeolocation.io/ipgeo?apiKey=free',
            'https://ip-api.com/json/',
            'https://freegeoip.app/json/',
            'https://ipwho.is/'
          ];
          
          let ipData = null;
          for (const service of ipServices) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              const ipResponse = await fetch(service, { signal: controller.signal });
              clearTimeout(timeoutId);
              if (ipResponse.ok) {
                ipData = await ipResponse.json();
                break;
              }
            } catch (serviceError) {
              // Silently continue to next service - don't log every failure
              continue;
            }
          }
          
          if (ipData) {
            let locationName = '';
            
            // Handle different response formats
            if (ipData.city && ipData.region && ipData.country) {
              locationName = `${ipData.city}, ${ipData.region}, ${ipData.country}`;
            } else if (ipData.city && ipData.country) {
              locationName = `${ipData.city}, ${ipData.country}`;
            } else if (ipData.display_name) {
              locationName = ipData.display_name;
            } else if (ipData.query && ipData.country) {
              locationName = `${ipData.query}, ${ipData.country}`;
            } else if (ipData.timezone) {
              // Use timezone as a fallback
              const timezone = ipData.timezone;
              const city = timezone.split('/')[1]?.replace('_', ' ') || 'Unknown';
              locationName = `${city} (${ipData.country || 'Unknown'})`;
            } else if (ipData.country) {
              locationName = ipData.country;
            }
            
            if (locationName) {
              weatherInput.value = locationName;
              
              locationStatus.className = 'location-status success';
              locationStatus.textContent = `Location detected (approximate): ${locationName}`;
              
              // Auto-save the detected location
              settings.cards = { ...settings.cards, weatherLocation: locationName };
              try {
                await window.electronAPI.updateSettings(settings);
                showNotification('Approximate location detected and saved', 'success');
              } catch (error) {
                showNotification('Error', 'Failed to save approximate location', 'error');
              }
              
              // Reset button state
              detectLocationBtn.disabled = false;
              detectLocationBtn.innerHTML = '<span class="button-icon">📍</span>Detect My Location';
              fallbackSucceeded = true;
              return;
            }
          }
        } catch (ipError) {
          console.warn('All IP-based geolocation services failed:', ipError);
        }
        
        // Final fallback: Use browser timezone to estimate location
        try {
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          
          if (timezone) {
            // Extract city and country from timezone
            const parts = timezone.split('/');
            if (parts.length >= 2) {
              const city = parts[1].replace('_', ' ');
              const country = parts[0];
              
              // Map some common timezone countries to actual country names
              const countryMap = {
                'America': 'United States',
                'Europe': 'Europe',
                'Asia': 'Asia',
                'Africa': 'Africa',
                'Australia': 'Australia',
                'Pacific': 'Pacific'
              };
              
              // Special handling for specific timezones
              let locationName = '';
              if (timezone === 'America/St_Lucia') {
                locationName = 'Castries, Saint Lucia';
              } else if (timezone === 'America/New_York') {
                locationName = 'New York, United States';
              } else if (timezone === 'America/Los_Angeles') {
                locationName = 'Los Angeles, United States';
              } else if (timezone === 'Europe/London') {
                locationName = 'London, United Kingdom';
              } else if (timezone === 'Europe/Paris') {
                locationName = 'Paris, France';
              } else {
                const countryName = countryMap[country] || country;
                locationName = `${city}, ${countryName}`;
              }
              
              weatherInput.value = locationName;
              
              locationStatus.className = 'location-status success';
              locationStatus.textContent = `Location estimated from timezone: ${locationName}`;
              
              // Auto-save the estimated location
              settings.cards = { ...settings.cards, weatherLocation: locationName };
              try {
                await window.electronAPI.updateSettings(settings);
                showNotification('Location estimated from timezone and saved', 'success');
              } catch (error) {
                showNotification('Error', 'Failed to save estimated location', 'error');
              }
              
              // Reset button state
              detectLocationBtn.disabled = false;
              detectLocationBtn.innerHTML = '<span class="button-icon">📍</span>Detect My Location';
              fallbackSucceeded = true;
              return;
            }
          }
        } catch (tzError) {
          // Silently handle timezone errors
        }
        
        // Only show error if all fallback methods failed
        if (!fallbackSucceeded) {
          let errorMessage = 'Failed to detect location';
          let notificationMessage = 'Location detection failed';
          
          // Use the error message from our improved error handling
          if (error.message) {
            errorMessage = error.message;
            // Extract a shorter message for the notification
            if (error.message.includes('access denied')) {
              notificationMessage = 'Location access denied';
            } else if (error.message.includes('unavailable')) {
              notificationMessage = 'Location unavailable';
            } else if (error.message.includes('timed out')) {
              notificationMessage = 'Location request timed out';
            } else {
              notificationMessage = 'Location detection failed';
            }
          }

          locationStatus.className = 'location-status error';
          locationStatus.textContent = `${errorMessage}\n\nYou can still enter your location manually in the input field above.`;
          showNotification(notificationMessage, 'error');
        }
      } finally {
        // Reset button state
        detectLocationBtn.disabled = false;
        detectLocationBtn.innerHTML = '<span class="button-icon">📍</span>Detect My Location';
      }
    });
  }
  
  // Ad blocking toggle
  const adblockToggle = settingsContent.querySelector('#adblock-toggle');
  if (adblockToggle) {
    adblockToggle.checked = settings.features?.adblock || false;
    adblockToggle.addEventListener('change', async (e) => {
      settings.features = { ...settings.features, adblock: e.target.checked };
      
      // Save immediately and show notification
      try {
        await window.electronAPI.updateSettings(settings);
        showNotification('Settings Saved', 'Ad blocking updated', 'success');
      } catch (error) {
        showNotification('Error', 'Failed to save ad blocking setting', 'error');
      }
    });
  }
  
  
  // Clear download history button
  const clearDownloadHistoryBtn = settingsContent.querySelector('#clear-download-history-btn');
  if (clearDownloadHistoryBtn) {
    clearDownloadHistoryBtn.addEventListener('click', () => {
      downloadHistory = [];
      localStorage.removeItem('nuruDownloadHistory');
      showNotification('Download history cleared', 'success');
    });
  }
  
  // Clear browsing history button
  const clearBrowsingHistoryBtn = settingsContent.querySelector('#clear-browsing-history-btn');
  if (clearBrowsingHistoryBtn) {
    clearBrowsingHistoryBtn.addEventListener('click', () => {
      historyData = [];
      saveHistory();
      showNotification('Browsing history cleared', 'success');
    });
  }
  
  // Password manager buttons
  const masterPasswordBtn = settingsContent.querySelector('#master-password-btn');
  const masterPasswordInput = settingsContent.querySelector('#master-password-input');
  if (masterPasswordBtn && masterPasswordInput) {
    masterPasswordBtn.addEventListener('click', async () => {
      const password = masterPasswordInput.value;
      if (!password) {
        showNotification('Please enter a master password', 'error');
        return;
      }
      try {
        const result = await window.electronAPI.setMasterPassword(password, true);
        if (result.success) {
          showNotification('Master password set successfully', 'success');
          masterPasswordInput.value = '';
        } else {
          showNotification(`Error: ${result.error}`, 'error');
        }
      } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
      }
    });
  }
  
  // Password export button
  const exportPasswordsBtn = settingsContent.querySelector('#export-passwords-btn');
  if (exportPasswordsBtn) {
    exportPasswordsBtn.addEventListener('click', async () => {
      try {
        const result = await window.electronAPI.exportPasswords();
        if (result.success) {
          showNotification('Passwords exported successfully', 'success');
        } else {
          showNotification(`Export failed: ${result.error}`, 'error');
        }
      } catch (error) {
        showNotification(`Export failed: ${error.message}`, 'error');
      }
    });
  }
  
  // Password import button
  const importPasswordsBtn = settingsContent.querySelector('#import-passwords-btn');
  if (importPasswordsBtn) {
    importPasswordsBtn.addEventListener('click', async () => {
      // Create file input for import
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            const text = await file.text();
            const result = await window.electronAPI.importPasswords(text);
            if (result.success) {
              showNotification('Passwords imported successfully', 'success');
            } else {
              showNotification(`Import failed: ${result.error}`, 'error');
            }
          } catch (error) {
            showNotification(`Import failed: ${error.message}`, 'error');
          }
        }
      };
      input.click();
    });
  }
  
  // Forget password button
  const forgetPasswordBtn = settingsContent.querySelector('#forget-password-btn');
  if (forgetPasswordBtn) {
    forgetPasswordBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to forget the master password? This will delete all saved passwords.')) {
        try {
          const result = await window.electronAPI.forgetPassword();
          if (result.success) {
            showNotification('Master password forgotten', 'success');
          } else {
            showNotification(`Error: ${result.error}`, 'error');
          }
        } catch (error) {
          showNotification(`Error: ${error.message}`, 'error');
        }
      }
    });
  }
  
  // Autofill toggle
  const autofillToggle = settingsContent.querySelector('#autofill-enabled-toggle');
  if (autofillToggle) {
    autofillToggle.checked = settings.autofillEnabled !== false;
    autofillToggle.addEventListener('change', async (e) => {
      settings.autofillEnabled = e.target.checked;
      
      // Save immediately and show notification
      try {
        await window.electronAPI.updateSettings(settings);
        showNotification('Settings Saved', 'Autofill updated', 'success');
      } catch (error) {
        showNotification('Error', 'Failed to save autofill setting', 'error');
      }
    });
  }
  
  // Development mode toggle
  const devModeToggle = settingsContent.querySelector('#development-mode-toggle');
  const developerToolsCard = settingsContent.querySelector('#developer-tools-card');
  const developerToolsGroup = document.querySelector('#developer-tools-group');
  
  if (devModeToggle) {
    devModeToggle.checked = settings.development_mode || false;
    
    // Set initial visibility of Developer Tools sections
    if (developerToolsCard) {
      developerToolsCard.style.display = settings.development_mode ? 'block' : 'none';
    }
    if (developerToolsGroup) {
      developerToolsGroup.style.display = settings.development_mode ? 'block' : 'none';
    }
    
    devModeToggle.addEventListener('change', async (e) => {
      settings.development_mode = e.target.checked;
      
      // Show/hide Developer Tools sections based on toggle state
      if (developerToolsCard) {
        developerToolsCard.style.display = e.target.checked ? 'block' : 'none';
      }
      if (developerToolsGroup) {
        developerToolsGroup.style.display = e.target.checked ? 'block' : 'none';
      }
      
      // Save immediately and show notification
      try {
        await window.electronAPI.updateSettings(settings);
        showNotification('Settings Saved', 'Developer mode updated', 'success');
      } catch (error) {
        showNotification('Error', 'Failed to save developer mode setting', 'error');
      }
    });
  }
  
  // Frameless toggle (inverted logic: checked = show frame, unchecked = frameless)
  const framelessToggle = settingsContent.querySelector('#frameless-toggle');
  if (framelessToggle) {
    framelessToggle.checked = !settings.frameless;
    framelessToggle.addEventListener('change', async (e) => {
      settings.frameless = !e.target.checked; // Invert the logic
      
      // Update nav buttons and clock visibility immediately
      updateNavAndClockVisibility();
      
      // Save immediately and show notification
      try {
        await window.electronAPI.updateSettings(settings);
        showNotification('Settings Saved', 'Window frame setting updated. Please restart the app to apply changes.', 'success');
      } catch (error) {
        showNotification('Error', 'Failed to save window frame setting', 'error');
      }
    });
  }
  
  // Remember window state toggle
  const rememberWindowStateToggle = settingsContent.querySelector('#remember-window-state-toggle');
  if (rememberWindowStateToggle) {
    rememberWindowStateToggle.checked = settings.rememberWindowState !== false;
    rememberWindowStateToggle.addEventListener('change', async (e) => {
      settings.rememberWindowState = e.target.checked;
      
      // Save immediately and show notification
      try {
        await window.electronAPI.updateSettings(settings);
        showNotification('Settings Saved', 'Window state setting updated', 'success');
      } catch (error) {
        showNotification('Error', 'Failed to save window state setting', 'error');
      }
    });
  }
  
  
  
  // Manage pinned apps button
  const managePinnedAppsBtn = settingsContent.querySelector('#manage-pinned-apps-btn');
  if (managePinnedAppsBtn) {
    managePinnedAppsBtn.addEventListener('click', () => {
      showNotification('Pinned apps management coming soon', 'info');
    });
  }
  
  // Clear cache button
  const clearCacheBtn = settingsContent.querySelector('#clear-cache-btn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      try {
        const result = await window.electronAPI.clearCache();
        if (result.success) {
          showNotification('Cache cleared successfully', 'success');
        } else {
          showNotification(`Error clearing cache: ${result.error}`, 'error');
        }
      } catch (error) {
        showNotification(`Error clearing cache: ${error.message}`, 'error');
      }
    });
  }
  
  // Delete user data button
  const deleteUserDataBtn = settingsContent.querySelector('#delete-user-data-btn');
  if (deleteUserDataBtn) {
    deleteUserDataBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete all user data? This cannot be undone.')) {
        try {
          const result = await window.electronAPI.deleteAllUserData();
          if (result.success) {
            showNotification('User data deleted. Restarting app...', 'success');
            setTimeout(() => window.electronAPI.restartApp(), 1000);
          } else {
            showNotification(`Error deleting user data: ${result.error}`, 'error');
          }
        } catch (error) {
          showNotification(`Error deleting user data: ${error.message}`, 'error');
        }
      }
    });
  }
  
  // Inline Diagnostics Functions
  let logRefreshTimer = null;
  
  async function loadInlineDiagnostics() {
    console.log('Loading inline diagnostics...');
    
    try {
      // Load app info
      const appInfo = await window.electronAPI.getAppInfo();
      updateInlineElement('inline-app-name', appInfo.appName || 'Nuru Browser');
      updateInlineElement('inline-app-version', appInfo.appVersion || '1.0.0');
      updateInlineElement('inline-electron-version', appInfo.electronVersion || 'Unknown');
      updateInlineElement('inline-chrome-version', appInfo.chromeVersion || 'Unknown');
      updateInlineElement('inline-node-version', appInfo.nodeVersion || 'Unknown');
      updateInlineElement('inline-platform', appInfo.platform || 'Unknown');
      updateInlineElement('inline-architecture', appInfo.arch || 'Unknown');
      updateInlineElement('inline-update-status', appInfo.updateStatus || 'Unknown');
      
      // Load system info
      const sysInfo = await window.electronAPI.getSystemInfo();
      updateInlineElement('inline-cpu-model', sysInfo.cpuModel || 'Unknown');
      updateInlineElement('inline-cpu-cores', sysInfo.cpuCores || 'Unknown');
      updateInlineElement('inline-total-memory', sysInfo.totalMemory ? `${sysInfo.totalMemory} GB` : 'Unknown');
      updateInlineElement('inline-free-memory', sysInfo.freeMemory ? `${sysInfo.freeMemory} GB` : 'Unknown');
      updateInlineElement('inline-os-type', sysInfo.osType || 'Unknown');
      updateInlineElement('inline-os-release', sysInfo.osRelease || 'Unknown');
      updateInlineElement('inline-hostname', sysInfo.hostname || 'Unknown');
      updateInlineElement('inline-uptime', sysInfo.uptime ? `${sysInfo.uptime} minutes` : 'Unknown');
      
      // Check WebGL
      await checkInlineWebGL();
      
      // Load logs
      await loadInlineLogs();
      
      // Load welcome screen settings
      await loadWelcomeScreenSettings();
      
    } catch (error) {
      console.error('Failed to load inline diagnostics:', error);
      // Set error state for all elements
      const errorElements = [
        'inline-app-name', 'inline-app-version', 'inline-electron-version',
        'inline-chrome-version', 'inline-node-version', 'inline-platform',
        'inline-architecture', 'inline-cpu-model', 'inline-cpu-cores',
        'inline-total-memory', 'inline-free-memory', 'inline-os-type',
        'inline-os-release', 'inline-hostname', 'inline-uptime', 'inline-update-status'
      ];
      
      errorElements.forEach(id => {
        const element = settingsContent.querySelector(`#${id}`);
        if (element) {
          element.textContent = 'Error loading';
          element.classList.add('error');
        }
      });
    }
  }
  
  async function checkInlineWebGL() {
    try {
      const webGLInfo = await window.electronAPI.checkWebGL();
      
      if (webGLInfo.available) {
        updateInlineElement('inline-webgl-status', 'Available', 'success');
        updateInlineElement('inline-webgl-renderer', webGLInfo.renderer || 'Not available');
        updateInlineElement('inline-webgl-vendor', webGLInfo.vendor || 'Not available');
        updateInlineElement('inline-webgl-version', `WebGL ${webGLInfo.version || '1.0'}`);
      } else {
        updateInlineElement('inline-webgl-status', 'Not Available', 'error');
        updateInlineElement('inline-webgl-renderer', 'Not available');
        updateInlineElement('inline-webgl-vendor', 'Not available');
        updateInlineElement('inline-webgl-version', 'Not available');
      }
    } catch (error) {
      console.error('Failed to check WebGL:', error);
      updateInlineElement('inline-webgl-status', 'Error checking', 'error');
      updateInlineElement('inline-webgl-renderer', 'Error checking');
      updateInlineElement('inline-webgl-vendor', 'Error checking');
      updateInlineElement('inline-webgl-version', 'Error checking');
    }
  }
  
  function updateInlineElement(elementId, value, className = '') {
    const element = settingsContent.querySelector(`#${elementId}`);
    if (element) {
      element.textContent = value;
      element.className = 'info-value';
      if (className) {
        element.classList.add(className);
      }
    }
  }
  
  // Load inline logs
  async function loadInlineLogs() {
    try {
      const logContent = await window.electronAPI.readLogFile();
      
      if (!logContent || logContent === 'No logs found.') {
        updateInlineElement('log-content-inline', 'No logs found or log file is empty.');
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
      const logElement = settingsContent.querySelector('#log-content-inline');
      if (logElement) {
        logElement.innerHTML = formattedContent;
        
        // Auto-scroll to bottom if enabled
        const autoScrollToggle = settingsContent.querySelector('#auto-scroll-inline-toggle');
        if (autoScrollToggle && autoScrollToggle.checked) {
          const logContainer = logElement.parentElement;
          logContainer.scrollTop = logContainer.scrollHeight;
        }
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
      const logElement = settingsContent.querySelector('#log-content-inline');
      if (logElement) {
        logElement.innerHTML = `<span class="log-error">Error loading logs: ${escapeHtml(error.message)}</span>`;
      }
    }
  }
  
  // Load welcome screen settings
  async function loadWelcomeScreenSettings() {
    try {
      const settings = await window.electronAPI.getWelcomeScreenSettings();
      const welcomeTestModeToggle = settingsContent.querySelector('#welcome-test-mode-inline-toggle');
      
      if (welcomeTestModeToggle && settings) {
        welcomeTestModeToggle.checked = settings.showWelcomeScreenOnStartup || false;
      }
    } catch (error) {
      console.error('Error loading welcome screen settings:', error);
    }
  }
  
  // Check for updates
  async function checkForUpdatesInline() {
    const checkUpdatesBtn = settingsContent.querySelector('#check-updates-inline-btn');
    if (checkUpdatesBtn) {
      setButtonLoading(checkUpdatesBtn, true);
    }
    
    try {
      const updateResult = await window.electronAPI.checkForUpdates();
      
      if (updateResult.success === false) {
        throw new Error(updateResult.error || 'Unknown error checking for updates');
      }
      
      // Refresh app info to get latest update status
      await loadInlineDiagnostics();
      
    } catch (error) {
      console.error('Failed to check for updates:', error);
      updateInlineElement('inline-update-status', 'Failed to check for updates', 'error');
    } finally {
      if (checkUpdatesBtn) {
        setButtonLoading(checkUpdatesBtn, false);
      }
    }
  }
  
  // Setup log auto-refresh
  function setupLogAutoRefresh() {
    // Clear existing timer
    if (logRefreshTimer) {
      clearInterval(logRefreshTimer);
      logRefreshTimer = null;
    }
    
    // Setup new timer if auto-refresh is enabled
    const autoRefreshToggle = settingsContent.querySelector('#auto-refresh-inline-toggle');
    if (autoRefreshToggle && autoRefreshToggle.checked) {
      logRefreshTimer = setInterval(loadInlineLogs, 5000);
      console.log('Log auto-refresh enabled (5s interval)');
    } else {
      console.log('Log auto-refresh disabled');
    }
  }
  
  // Set button loading state
  function setButtonLoading(button, isLoading) {
    if (isLoading) {
      button.classList.add('loading');
      button.disabled = true;
    } else {
      button.classList.remove('loading');
      button.disabled = false;
    }
  }
  
  // Escape HTML to prevent XSS
  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Browser Information toggle
  const showBrowserInfoToggle = settingsContent.querySelector('#show-browser-info-toggle');
  const browserInfoDisplay = settingsContent.querySelector('#browser-info-display');
  
  if (showBrowserInfoToggle && browserInfoDisplay) {
    // Set initial state
    showBrowserInfoToggle.checked = settings.show_browser_info || false;
    browserInfoDisplay.style.display = settings.show_browser_info ? 'block' : 'none';
    
    // Toggle event listener
    showBrowserInfoToggle.addEventListener('change', async (e) => {
      const isEnabled = e.target.checked;
      browserInfoDisplay.style.display = isEnabled ? 'block' : 'none';
      
      // Save the setting
      settings.show_browser_info = isEnabled;
      try {
        await window.electronAPI.updateSettings(settings);
      } catch (error) {
        console.error('Failed to save browser info setting:', error);
      }
      
      // Load diagnostics data if enabled
      if (isEnabled) {
        loadInlineDiagnostics();
      }
    });
    
    // Load diagnostics data if already enabled
    if (settings.show_browser_info) {
      loadInlineDiagnostics();
    }
  }
  
  // Inline diagnostics refresh button
  const refreshBrowserInfoBtn = settingsContent.querySelector('#refresh-browser-info-btn');
  if (refreshBrowserInfoBtn) {
    refreshBrowserInfoBtn.addEventListener('click', () => {
      loadInlineDiagnostics();
    });
  }
  
  // Inline WebGL check button
  const checkWebglInlineBtn = settingsContent.querySelector('#check-webgl-inline-btn');
  if (checkWebglInlineBtn) {
    checkWebglInlineBtn.addEventListener('click', () => {
      checkInlineWebGL();
    });
  }
  
  // Check for updates button
  const checkUpdatesInlineBtn = settingsContent.querySelector('#check-updates-inline-btn');
  if (checkUpdatesInlineBtn) {
    checkUpdatesInlineBtn.addEventListener('click', () => {
      checkForUpdatesInline();
    });
  }
  
  // Welcome screen test mode toggle
  const welcomeTestModeInlineToggle = settingsContent.querySelector('#welcome-test-mode-inline-toggle');
  if (welcomeTestModeInlineToggle) {
    welcomeTestModeInlineToggle.addEventListener('change', async (e) => {
      try {
        const enabled = e.target.checked;
        await window.electronAPI.setWelcomeScreenTestMode(enabled);
        console.log('Welcome screen test mode:', enabled ? 'enabled' : 'disabled');
      } catch (error) {
        console.error('Error setting welcome screen test mode:', error);
      }
    });
  }
  
  // Reset welcome screen button
  const resetWelcomeInlineBtn = settingsContent.querySelector('#reset-welcome-inline-btn');
  if (resetWelcomeInlineBtn) {
    resetWelcomeInlineBtn.addEventListener('click', async () => {
      try {
        setButtonLoading(resetWelcomeInlineBtn, true);
        await window.electronAPI.resetWelcomeScreen();
        console.log('Welcome screen reset successfully');
      } catch (error) {
        console.error('Error resetting welcome screen:', error);
      } finally {
        setButtonLoading(resetWelcomeInlineBtn, false);
      }
    });
  }
  
  // Log controls
  const refreshLogsInlineBtn = settingsContent.querySelector('#refresh-logs-inline-btn');
  if (refreshLogsInlineBtn) {
    refreshLogsInlineBtn.addEventListener('click', () => {
      loadInlineLogs();
    });
  }
  
  const clearLogsInlineBtn = settingsContent.querySelector('#clear-logs-inline-btn');
  if (clearLogsInlineBtn) {
    clearLogsInlineBtn.addEventListener('click', () => {
      const logElement = settingsContent.querySelector('#log-content-inline');
      if (logElement) {
        logElement.textContent = 'Logs cleared from view. Click Refresh to reload.';
      }
    });
  }
  
  // Auto-refresh toggle
  const autoRefreshInlineToggle = settingsContent.querySelector('#auto-refresh-inline-toggle');
  if (autoRefreshInlineToggle) {
    autoRefreshInlineToggle.addEventListener('change', setupLogAutoRefresh);
  }
  
  // Auto-scroll toggle
  const autoScrollInlineToggle = settingsContent.querySelector('#auto-scroll-inline-toggle');
  if (autoScrollInlineToggle) {
    autoScrollInlineToggle.addEventListener('change', () => {
      if (autoScrollInlineToggle.checked) {
        const logElement = settingsContent.querySelector('#log-content-inline');
        if (logElement) {
          const logContainer = logElement.parentElement;
          logContainer.scrollTop = logContainer.scrollHeight;
        }
      }
    });
  }
  
  // Save settings button
  const saveSettingsBtn = settingsContent.querySelector('#save-settings-btn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
      try {
        const result = await window.electronAPI.updateSettings(settings);
        if (result.success) {
          showNotification('Settings saved successfully!', 'success');
          hideSettingsViewport();
        } else {
          showNotification(`Failed to save settings: ${result.error}`, 'error');
        }
      } catch (error) {
        showNotification(`Error saving settings: ${error.message}`, 'error');
      }
    });
  }
}

// Close settings button
if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener('click', () => {
    hideSettingsViewport();
  });
}

// Close settings with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsViewport && settingsViewport.classList.contains('active')) {
    hideSettingsViewport();
  }
});

// Listen for context menu settings request
if (window.electronAPI && window.electronAPI.onShowSettings) {
  window.electronAPI.onShowSettings(() => {
    showSettingsViewport();
  });
}
