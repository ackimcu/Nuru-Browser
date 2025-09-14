// Nuru Browser Start Page - Enhanced JavaScript 2025
// Apple-inspired design with modern UX features

class NuruStartPage {
    constructor() {
        this.settings = {};
        this.bookmarks = [];
        this.recentActivity = [];
        this.systemStats = {};
        this.weatherData = null;
        this.searchSuggestions = [];
        this.theme = 'auto';
        
        // Performance tracking
        this.performanceMetrics = {
            loadTime: 0,
            renderTime: 0,
            interactionTime: 0
        };
        
        this.init();
    }

    async init() {
        const startTime = performance.now();
        
        try {
            await this.loadSettings();
            await this.loadUserData();
            this.setupEventListeners();
            this.initializeTheme();
            this.updateTimeAndDate();
            this.updateGreeting();
            this.loadWeather();
            this.loadSystemStats();
            this.startTimeUpdate();
            
            
            this.animateElements();
            this.setupKeyboardNavigation();
            this.loadRecentActivity();
            
            this.performanceMetrics.loadTime = performance.now() - startTime;
            console.log(`Start page loaded in ${this.performanceMetrics.loadTime.toFixed(2)}ms`);
        } catch (error) {
            console.error('Failed to initialize start page:', error);
            this.showNotification('Failed to load start page', 'error');
        }
    }

    async loadSettings() {
        try {
            if (window.parent && window.parent !== window) {
                this.settings = await window.parent.electronAPI.getSettings();
            } else if (window.electronAPI && window.electronAPI.getSettings) {
                this.settings = await window.electronAPI.getSettings();
            } else {
                this.settings = {
                    search_engine: { url: 'https://www.google.com/search?q=' },
                    cards: { weatherLocation: 'Castries, Saint Lucia', weatherTemperatureUnit: 'celsius' },
                    theme: 'auto',
                    bookmarks: []
                };
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
            this.settings = this.getDefaultSettings();
        }
    }

    getDefaultSettings() {
        return {
            search_engine: { url: 'https://www.google.com/search?q=' },
            cards: { weatherLocation: 'Castries, Saint Lucia', weatherTemperatureUnit: 'celsius' },
            theme: 'auto',
            bookmarks: this.getDefaultBookmarks()
        };
    }
    
    saveSettings() {
        try {
            localStorage.setItem('nuruSettings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    async loadUserData() {
        try {
            // Load bookmarks
            const storedBookmarks = localStorage.getItem('nuruBookmarks');
            this.bookmarks = storedBookmarks ? JSON.parse(storedBookmarks) : this.getDefaultBookmarks();
            this.renderBookmarks();

            // Load notes

        } catch (error) {
            console.error('Failed to load user data:', error);
        }
    }

    getDefaultBookmarks() {
        return [
            {
                name: 'Google',
                url: 'https://www.google.com',
                icon: 'fas fa-search',
                folder: 'general',
                added: new Date().toISOString()
            },
            {
                name: 'GitHub',
                url: 'https://github.com',
                icon: 'fab fa-github',
                folder: 'work',
                added: new Date().toISOString()
            },
            {
                name: 'YouTube',
                url: 'https://www.youtube.com',
                icon: 'fab fa-youtube',
                folder: 'entertainment',
                added: new Date().toISOString()
            },
            {
                name: 'Reddit',
                url: 'https://www.reddit.com',
                icon: 'fab fa-reddit',
                folder: 'entertainment',
                added: new Date().toISOString()
            },
            {
                name: 'Stack Overflow',
                url: 'https://stackoverflow.com',
                icon: 'fab fa-stack-overflow',
                folder: 'work',
                added: new Date().toISOString()
            },
            {
                name: 'Wikipedia',
                url: 'https://www.wikipedia.org',
                icon: 'fas fa-wikipedia-w',
                folder: 'general',
                added: new Date().toISOString()
            }
        ];
    }

    setupEventListeners() {
        // Widget interactions
        this.setupWidgetListeners();
        
        // Modal interactions
        this.setupModalListeners();
        
        // Navigation buttons
        this.setupNavigationListeners();
        
        // Theme toggle
        this.setupThemeListeners();
        
    }


    setupWidgetListeners() {
        // Quick actions
        const actionButtons = [
            'new-tab-btn', 'bookmark-page-btn', 'downloads-btn', 'reading-mode-btn',
            'screenshot-btn', 'clear-cache-btn', 'incognito-btn', 'dev-tools-btn'
        ];

        actionButtons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', () => this.handleQuickAction(id));
            }
        });

        // Weather refresh
        const weatherRefresh = document.getElementById('weather-refresh');
        if (weatherRefresh) {
            weatherRefresh.addEventListener('click', () => this.loadWeather());
        }

        // System refresh
        const systemRefresh = document.getElementById('refresh-system-btn');
        if (systemRefresh) {
            systemRefresh.addEventListener('click', () => this.loadSystemStats());
        }
    }

    setupModalListeners() {
        // Add bookmark modal
        const addBookmarkBtn = document.getElementById('add-bookmark-btn');
        const bookmarkModal = document.getElementById('add-bookmark-modal');
        const modalClose = document.getElementById('modal-close');
        const modalCancel = document.getElementById('modal-cancel');
        const modalSave = document.getElementById('modal-save');

        if (addBookmarkBtn) {
            addBookmarkBtn.addEventListener('click', () => this.showModal(bookmarkModal));
        }

        if (modalClose) {
            modalClose.addEventListener('click', () => this.hideModal(bookmarkModal));
        }

        if (modalCancel) {
            modalCancel.addEventListener('click', () => this.hideModal(bookmarkModal));
        }

        if (modalSave) {
            modalSave.addEventListener('click', () => this.saveBookmark());
        }

        // Icon picker
        this.setupIconPicker();

        // Note modal
        const newNoteBtn = document.getElementById('new-note-btn');
        const noteModal = document.getElementById('note-modal');
        const noteModalClose = document.getElementById('note-modal-close');
        const noteModalCancel = document.getElementById('note-modal-cancel');
        const noteModalSave = document.getElementById('note-modal-save');

        if (newNoteBtn) {
            newNoteBtn.addEventListener('click', () => this.showModal(noteModal));
        }

        if (noteModalClose) {
            noteModalClose.addEventListener('click', () => this.hideModal(noteModal));
        }

        if (noteModalCancel) {
            noteModalCancel.addEventListener('click', () => this.hideModal(noteModal));
        }

        if (noteModalSave) {
            noteModalSave.addEventListener('click', () => this.saveNote());
        }

        // Close modals on overlay click
        [bookmarkModal, noteModal].forEach(modal => {
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.hideModal(modal);
                    }
                });
            }
        });
    }

    setupIconPicker() {
        const iconOptions = document.querySelectorAll('.icon-option');
        const iconInput = document.getElementById('bookmark-icon');

        iconOptions.forEach(option => {
            option.addEventListener('click', () => {
                iconOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                if (iconInput) {
                    iconInput.value = option.dataset.icon;
                }
            });
        });
    }

    setupNavigationListeners() {
        const navButtons = {
            'help-btn': () => this.showHelp(),
            'about-btn': () => this.showAbout(),
            'feedback-btn': () => this.showFeedback()
        };

        Object.entries(navButtons).forEach(([id, action]) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', action);
            }
        });
    }

    setupThemeListeners() {
        // Listen for system theme changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', () => {
                if (this.theme === 'auto') {
                    this.updateTheme();
                }
            });
        }
    }



    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            // Escape key closes modals
            if (e.key === 'Escape') {
                const openModal = document.querySelector('.modal-overlay[style*="flex"]');
                if (openModal) {
                    this.hideModal(openModal);
                }
            }


            // Ctrl/Cmd + N opens new tab
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.handleQuickAction('new-tab-btn');
            }
        });
    }


    isUrl(text) {
        try {
            new URL(text);
            return true;
        } catch {
            return /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(text);
        }
    }

    navigateToUrl(url) {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'navigate-to-url',
                url: url
            }, '*');
        } else if (window.electronAPI && window.electronAPI.navigateToUrl) {
            window.electronAPI.navigateToUrl(url);
        } else {
            console.log('Navigate to:', url);
        }
    }

    navigateToSearch(query) {
        const searchEngine = this.settings.search_engine || { url: 'https://www.google.com/search?q=' };
        const searchUrl = searchEngine.url + encodeURIComponent(query);
        this.navigateToUrl(searchUrl);
    }

    // Widget functionality
    handleQuickAction(actionId) {
        const actions = {
            'new-tab-btn': () => this.openNewTab(),
            'bookmark-page-btn': () => this.bookmarkCurrentPage(),
            'downloads-btn': () => this.showDownloads(),
            'reading-mode-btn': () => this.toggleReadingMode(),
            'screenshot-btn': () => this.takeScreenshot(),
            'clear-cache-btn': () => this.clearCache(),
            'incognito-btn': () => this.openIncognito(),
            'dev-tools-btn': () => this.openDevTools()
        };

        const action = actions[actionId];
        if (action) {
            action();
        }
    }

    // Time and date updates - using the same format as tabs
    updateTimeAndDate() {
        const now = new Date();
        
        const timeElement = document.getElementById('time-display');
        const dateElement = document.getElementById('date-display');
        
        if (timeElement) {
            timeElement.textContent = this.formatTime(now);
        }

        if (dateElement) {
            dateElement.textContent = this.formatDate(now);
        }
    }
    
    formatTime(date) {
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours}:${minutes} ${ampm}`;
    }

    formatDate(date) {
        const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
        const day = date.getDate();
        const year = date.getFullYear();
        return `${weekday} ${day}, ${year}`;
    }

    updateGreeting() {
        const greetingElement = document.getElementById('dynamic-greeting');
        const subtitleElement = document.getElementById('greeting-subtitle');
        
        if (!greetingElement || !subtitleElement) return;

        const hour = new Date().getHours();
        let greeting, subtitle;

        if (hour < 12) {
            greeting = 'Good morning';
            subtitle = 'Ready to start your day?';
        } else if (hour < 17) {
            greeting = 'Good afternoon';
            subtitle = 'How can we help you today?';
        } else {
            greeting = 'Good evening';
            subtitle = 'Time to unwind and explore';
        }

        greetingElement.textContent = greeting;
        subtitleElement.textContent = subtitle;
    }

    startTimeUpdate() {
        setInterval(() => {
            this.updateTimeAndDate();
        }, 1000);
        
        // Update weather every 30 minutes (same as renderer.js)
        setInterval(() => {
            this.loadWeather();
        }, 30 * 60 * 1000);
    }

    // Weather functionality - using the same working code as renderer.js
    async loadWeather() {
        const location = this.settings.cards?.weatherLocation;
        console.log('loadWeather called with location:', location);
        
        if (!location) {
            // Try to get location from the main renderer's settings
            console.log('No location in start page settings, trying to get from main renderer...');
            
            // Check if we can access the main renderer's settings
            if (window.parent && window.parent.settings) {
                const mainSettings = window.parent.settings;
                console.log('Main renderer settings:', mainSettings);
                if (mainSettings.cards?.weatherLocation) {
                    this.settings.cards = this.settings.cards || {};
                    this.settings.cards.weatherLocation = mainSettings.cards.weatherLocation;
                    this.settings.cards.weatherTemperatureUnit = mainSettings.cards.weatherTemperatureUnit || 'celsius';
                    this.saveSettings();
                    console.log('Copied location from main renderer:', mainSettings.cards.weatherLocation);
                    // Recursively call loadWeather with the new location
                    return this.loadWeather();
                }
            }
            
            // Fallback to default location (same as main renderer)
            this.settings.cards = this.settings.cards || {};
            this.settings.cards.weatherLocation = 'Castries, Saint Lucia';
            this.settings.cards.weatherTemperatureUnit = 'celsius';
            this.saveSettings();
            console.log('No location found anywhere, using default: Castries, Saint Lucia');
            return;
        }

        console.log('Starting weather load for:', location);
        // Show loading state
        this.updateStartPageWeather({ loading: true });

        try {
            // Geocode location
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`);
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
            const tempUnit = this.settings.cards?.weatherTemperatureUnit || 'celsius';
            let tempStr;
            
            if (tempUnit === 'fahrenheit') {
                const fTemp = (cTemp * 9/5 + 32).toFixed(1);
                tempStr = `${fTemp}°F`;
            } else {
                tempStr = `${cTemp.toFixed(1)}°C`;
            }
            
            // Update the start page weather display
            this.updateStartPageWeather({ temp: tempStr, location: shortLocation, iconClass: 'fas fa-cloud-sun' });
        } catch (err) {
            console.error('Weather fetch error', err);
            this.updateStartPageWeather({ error: true });
        }
    }
    
    updateStartPageWeather(data) {
        const tempElement = document.getElementById('weather-temp');
        const descElement = document.getElementById('weather-desc');
        
        if (data.loading) {
            if (tempElement) tempElement.textContent = '--°';
            if (descElement) descElement.textContent = 'Loading...';
        } else if (data.error) {
            if (tempElement) tempElement.textContent = '--°';
            if (descElement) descElement.textContent = 'No weather';
        } else {
            if (tempElement) tempElement.textContent = data.temp || '--°';
            if (descElement) descElement.textContent = data.location || 'Unknown';
        }
    }

    // System stats
    async loadSystemStats() {
        try {
            // Mock system stats - in production, get real system information
            this.systemStats = {
                memory: Math.floor(Math.random() * 40) + 20,
                cpu: Math.floor(Math.random() * 30) + 10,
                storage: Math.floor(Math.random() * 50) + 30
            };
            this.renderSystemStats();
        } catch (error) {
            console.error('Failed to load system stats:', error);
        }
    }

    renderSystemStats() {
        const memoryElement = document.getElementById('memory-usage');
        const cpuElement = document.getElementById('cpu-usage');
        const storageElement = document.getElementById('storage-usage');

        if (memoryElement) memoryElement.textContent = `${this.systemStats.memory}%`;
        if (cpuElement) cpuElement.textContent = `${this.systemStats.cpu}%`;
        if (storageElement) storageElement.textContent = `${this.systemStats.storage}%`;
    }

    // Bookmarks functionality
    renderBookmarks() {
        const container = document.getElementById('bookmarks-grid');
        if (!container) return;

        container.innerHTML = '';

        this.bookmarks.forEach((bookmark, index) => {
            const item = document.createElement('div');
            item.className = 'bookmark-item';
            item.innerHTML = `
                <div class="bookmark-icon">
                    <i class="${bookmark.icon}" aria-hidden="true"></i>
                </div>
                <div class="bookmark-info">
                    <div class="bookmark-name">${bookmark.name}</div>
                    <div class="bookmark-url">${bookmark.url}</div>
                </div>
            `;
            item.addEventListener('click', () => this.navigateToUrl(bookmark.url));
            container.appendChild(item);
        });
    }

    saveBookmark() {
        const name = document.getElementById('bookmark-name').value.trim();
        const url = document.getElementById('bookmark-url').value.trim();
        const icon = document.getElementById('bookmark-icon').value;
        const folder = document.getElementById('bookmark-folder').value;

        if (!name || !url) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }

        const newBookmark = {
            name,
            url,
            icon,
            folder,
            added: new Date().toISOString()
        };

        this.bookmarks.push(newBookmark);
        this.saveBookmarks();
        this.renderBookmarks();
        this.hideModal(document.getElementById('add-bookmark-modal'));
        
        // Clear form
        document.getElementById('bookmark-name').value = '';
        document.getElementById('bookmark-url').value = '';
        document.getElementById('bookmark-icon').value = 'fas fa-globe';
        
        this.showNotification('Bookmark added successfully', 'success');
    }

    saveBookmarks() {
        localStorage.setItem('nuruBookmarks', JSON.stringify(this.bookmarks));
    }


    // Recent activity
    loadRecentActivity() {
        const storedActivity = localStorage.getItem('nuruActivity');
        this.recentActivity = storedActivity ? JSON.parse(storedActivity) : [];
        this.renderRecentActivity();
    }

    renderRecentActivity() {
        const container = document.getElementById('activity-list');
        if (!container) return;

        container.innerHTML = '';

        this.recentActivity.slice(0, 5).forEach(activity => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            item.innerHTML = `
                <div class="activity-icon">
                    <i class="${activity.icon}" aria-hidden="true"></i>
                </div>
                <div class="activity-info">
                    <div class="activity-title">${activity.title}</div>
                    <div class="activity-time">${this.formatTimeAgo(activity.timestamp)}</div>
                </div>
            `;
            item.addEventListener('click', () => this.navigateToUrl(activity.url));
            container.appendChild(item);
        });
    }

    addToRecentActivity(type, title, url) {
        const activity = {
            type,
            title,
            url,
            icon: this.getActivityIcon(type),
            timestamp: new Date().toISOString()
        };

        this.recentActivity.unshift(activity);
        this.recentActivity = this.recentActivity.slice(0, 50); // Keep only last 50
        this.saveRecentActivity();
        this.renderRecentActivity();
    }

    getActivityIcon(type) {
        const icons = {
            search: 'fas fa-magnifying-glass',
            bookmark: 'fas fa-bookmark',
            navigation: 'fas fa-external-link-alt',
            download: 'fas fa-download'
        };
        return icons[type] || 'fas fa-circle';
    }

    saveRecentActivity() {
        localStorage.setItem('nuruActivity', JSON.stringify(this.recentActivity));
    }


    // Theme functionality
    initializeTheme() {
        const savedTheme = localStorage.getItem('nuruTheme') || 'auto';
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        this.theme = theme;
        localStorage.setItem('nuruTheme', theme);
        this.updateTheme();
    }

    updateTheme() {
        const container = document.querySelector('.start-page-container');
        if (!container) return;

        let actualTheme = this.theme;
        
        if (this.theme === 'auto') {
            actualTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        container.setAttribute('data-theme', actualTheme);
    }


    // Modal functionality
    showModal(modal) {
        if (modal) {
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
            modal.classList.add('fade-in');
            
            // Focus first input
            const firstInput = modal.querySelector('input, textarea, select');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }

    hideModal(modal) {
        if (modal) {
            modal.classList.remove('fade-in');
            modal.setAttribute('aria-hidden', 'true');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        }
    }

    // Animation
    animateElements() {
        const elements = document.querySelectorAll('.widget, .bookmark-item, .activity-item');
        elements.forEach((element, index) => {
            element.style.opacity = '0';
            element.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                element.style.transition = 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            }, index * 100);
        });
    }


    // Utility functions
    formatTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffInSeconds = Math.floor((now - time) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            transition: all 0.3s ease;
            background: ${type === 'error' ? 'var(--accent-error)' : type === 'success' ? 'var(--accent-success)' : 'var(--accent-color)'};
            box-shadow: var(--shadow-large);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // Action methods
    openNewTab() {
        this.addToRecentActivity('navigation', 'New Tab', '');
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'open-new-tab' }, '*');
        } else if (window.electronAPI && window.electronAPI.openNewTab) {
            window.electronAPI.openNewTab();
        }
    }

    bookmarkCurrentPage() {
        this.showNotification('Bookmark functionality coming soon', 'info');
    }

    showDownloads() {
        this.addToRecentActivity('download', 'Downloads', '');
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'show-downloads' }, '*');
        } else if (window.electronAPI && window.electronAPI.showDownloads) {
            window.electronAPI.showDownloads();
        }
    }

    toggleReadingMode() {
        this.showNotification('Reading mode functionality coming soon', 'info');
    }

    takeScreenshot() {
        this.showNotification('Screenshot functionality coming soon', 'info');
    }

    clearCache() {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'clear-cache' }, '*');
        } else if (window.electronAPI && window.electronAPI.clearCache) {
            window.electronAPI.clearCache().then(() => {
                this.showNotification('Cache cleared successfully', 'success');
            }).catch(() => {
                this.showNotification('Failed to clear cache', 'error');
            });
        }
    }

    openIncognito() {
        this.addToRecentActivity('navigation', 'Incognito Window', '');
        this.showNotification('Incognito mode functionality coming soon', 'info');
    }

    openDevTools() {
        this.addToRecentActivity('navigation', 'Developer Tools', '');
        this.showNotification('Developer tools functionality coming soon', 'info');
    }

    openSettings() {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'open-settings' }, '*');
        } else if (window.electronAPI && window.electronAPI.openSettings) {
            window.electronAPI.openSettings();
        }
    }

    showBookmarks() {
        this.showNotification('Bookmarks panel coming soon', 'info');
    }

    showHistory() {
        this.showNotification('History panel coming soon', 'info');
    }

    showHelp() {
        this.showNotification('Help documentation coming soon', 'info');
    }

    showAbout() {
        this.showNotification('Nuru Browser v1.0.0 - A modern, privacy-focused browser', 'info');
    }

    showFeedback() {
        this.showNotification('Feedback form coming soon', 'info');
    }
}

// Initialize start page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.nuruStartPage = new NuruStartPage();
});

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NuruStartPage;
}