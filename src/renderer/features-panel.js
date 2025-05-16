/**
 * Nuru Browser Features Panel
 * 
 * Provides a user interface for managing native features:
 * - Enhanced Dark Mode
 */

// Initialize features panel when DOM content is loaded
document.addEventListener('DOMContentLoaded', () => {
  initFeaturesPanel();
});

// Feature settings and state
let featureSettings = {
  darkMode: {
    enabled: true,
    autoDetect: true,
    brightnessReduction: 85,
    contrastEnhancement: 10
  }
};

let featureStats = {
  darkMode: { appliedSites: 0, totalSites: 0 }
};

/**
 * Initialize the features panel
 */
async function initFeaturesPanel() {
  // Create features panel element
  const panelHTML = createFeaturesPanelHTML();
  document.body.insertAdjacentHTML('beforeend', panelHTML);
  
  // Get panel element
  const panel = document.getElementById('features-panel');
  if (!panel) return;
  
  // Add toggle button to navigation
  addFeaturesPanelButton();
  
  // Setup event listeners for panel buttons
  setupEventListeners();
  
  // Initialize feature settings from main process
  await loadFeatureSettings();
  
  // Update UI with loaded settings
  updateFeatureUI();
  
  // Set up event listeners for feature status updates
  setupFeatureEventListeners();
}

/**
 * Create HTML for features panel
 * @returns {string} HTML for the features panel
 */
function createFeaturesPanelHTML() {
  return `
    <div id="features-panel" class="features-panel">
      <div class="features-panel-header">
        <h2>Native Features</h2>
        <button id="close-features-panel" class="close-button">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>
      
      <div class="features-panel-content">
        <!-- Enhanced Dark Mode Section -->
        <div class="feature-section">
          <div class="feature-header">
            <h3>Enhanced Dark Mode</h3>
            <label class="switch">
              <input type="checkbox" id="dark-mode-toggle">
              <span class="slider round"></span>
            </label>
          </div>
          <div class="feature-stats">
            <p>Applied sites: <span id="dark-mode-applied">0</span></p>
            <p>Total sites: <span id="dark-mode-total">0</span></p>
          </div>
          <div class="feature-settings">
            <label class="setting-label">
              <input type="checkbox" id="dark-mode-autodetect">
              Auto-detect existing dark mode
            </label>
            <div class="slider-control">
              <label for="dark-mode-brightness">Brightness reduction: <span id="brightness-value">85</span>%</label>
              <input type="range" id="dark-mode-brightness" min="40" max="95" value="85">
            </div>
            <div class="slider-control">
              <label for="dark-mode-contrast">Contrast enhancement: <span id="contrast-value">10</span>%</label>
              <input type="range" id="dark-mode-contrast" min="0" max="30" value="10">
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Add features panel toggle button to navigation
 */
function addFeaturesPanelButton() {
  const navButtons = document.querySelector('.navigation-buttons');
  if (!navButtons) return;
  
  const featureButton = document.createElement('div');
  featureButton.className = 'nav-button';
  featureButton.id = 'toggle-features-panel';
  featureButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
    </svg>
  `;
  featureButton.title = 'Features Settings';
  
  navButtons.appendChild(featureButton);
}

/**
 * Setup event listeners for features panel elements
 */
function setupEventListeners() {
  // Panel toggle button
  const toggleButton = document.getElementById('toggle-features-panel');
  if (toggleButton) {
    toggleButton.addEventListener('click', toggleFeaturesPanel);
  }
  
  // Close button
  const closeButton = document.getElementById('close-features-panel');
  if (closeButton) {
    closeButton.addEventListener('click', closeFeaturesPanel);
  }
  
  // Dark Mode controls
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  if (darkModeToggle) {
    darkModeToggle.addEventListener('change', async () => {
      await window.electronAPI.setDarkModeEnabled(darkModeToggle.checked);
      await window.electronAPI.setDarkMode(darkModeToggle.checked);
      featureSettings.darkMode.enabled = darkModeToggle.checked;
    });
  }
  
  const autoDetectToggle = document.getElementById('dark-mode-autodetect');
  if (autoDetectToggle) {
    autoDetectToggle.addEventListener('change', updateDarkModeSettings);
  }
  
  const brightnessSlider = document.getElementById('dark-mode-brightness');
  if (brightnessSlider) {
    brightnessSlider.addEventListener('input', () => {
      document.getElementById('brightness-value').textContent = brightnessSlider.value;
    });
    brightnessSlider.addEventListener('change', updateDarkModeSettings);
  }
  
  const contrastSlider = document.getElementById('dark-mode-contrast');
  if (contrastSlider) {
    contrastSlider.addEventListener('input', () => {
      document.getElementById('contrast-value').textContent = contrastSlider.value;
    });
    contrastSlider.addEventListener('change', updateDarkModeSettings);
  }
}

/**
 * Setup event listeners for feature status updates
 */
function setupFeatureEventListeners() {
  // Feature status changes
  window.electronAPI.onFeatureStatusChanged((featureId, status) => {
    if (featureId === 'darkMode') {
      featureSettings.darkMode = status;
    }
    updateFeatureUI();
  });
  
  // Dark mode settings changes
  window.electronAPI.onDarkModeSettingsChanged(settings => {
    featureStats.darkMode = settings.stats;
    featureSettings.darkMode = { 
      ...featureSettings.darkMode, 
      ...settings.config 
    };
    updateFeatureUI();
    updateFeatureStats();
  });
}

/**
 * Update dark mode settings
 */
async function updateDarkModeSettings() {
  const autoDetect = document.getElementById('dark-mode-autodetect').checked;
  const brightnessReduction = parseInt(document.getElementById('dark-mode-brightness').value, 10);
  const contrastEnhancement = parseInt(document.getElementById('dark-mode-contrast').value, 10);
  
  const settings = {
    autoDetect,
    brightnessReduction,
    contrastEnhancement
  };
  
  featureSettings.darkMode = {
    ...featureSettings.darkMode,
    ...settings
  };
  
  await window.electronAPI.updateDarkModeSettings(settings);
}

/**
 * Load feature settings from main process
 */
async function loadFeatureSettings() {
  try {
    // Load Dark Mode settings
    const darkModeConfig = await window.electronAPI.getDarkModeConfig();
    featureSettings.darkMode = darkModeConfig;
    const darkModeStats = await window.electronAPI.getDarkModeStats();
    featureStats.darkMode = darkModeStats;
  } catch (error) {
    console.error('Error loading feature settings:', error);
  }
}

/**
 * Update feature UI based on current settings
 */
function updateFeatureUI() {
  // Update Dark Mode UI
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  if (darkModeToggle) {
    darkModeToggle.checked = featureSettings.darkMode.enabled;
  }
  
  const autoDetectToggle = document.getElementById('dark-mode-autodetect');
  if (autoDetectToggle) {
    autoDetectToggle.checked = featureSettings.darkMode.autoDetect;
  }
  
  const brightnessSlider = document.getElementById('dark-mode-brightness');
  const brightnessValue = document.getElementById('brightness-value');
  if (brightnessSlider && brightnessValue) {
    brightnessSlider.value = featureSettings.darkMode.brightnessReduction;
    brightnessValue.textContent = featureSettings.darkMode.brightnessReduction;
  }
  
  const contrastSlider = document.getElementById('dark-mode-contrast');
  const contrastValue = document.getElementById('contrast-value');
  if (contrastSlider && contrastValue) {
    contrastSlider.value = featureSettings.darkMode.contrastEnhancement;
    contrastValue.textContent = featureSettings.darkMode.contrastEnhancement;
  }
  
  // Update stats
  updateFeatureStats();
}

/**
 * Update feature statistics display
 */
function updateFeatureStats() {
  // Dark Mode stats only
  const applied = document.getElementById('dark-mode-applied');
  const total = document.getElementById('dark-mode-total');
  if (applied && total) {
    applied.textContent = featureStats.darkMode.appliedSites;
    total.textContent = featureStats.darkMode.totalSites;
  }
}

/**
 * Toggle features panel visibility
 */
function toggleFeaturesPanel() {
  const panel = document.getElementById('features-panel');
  const isVisible = panel.classList.contains('visible');
  
  if (isVisible) {
    panel.classList.remove('visible');
  } else {
    panel.classList.add('visible');
  }
}

/**
 * Close features panel
 */
function closeFeaturesPanel() {
  const panel = document.getElementById('features-panel');
  panel.classList.remove('visible');
}
