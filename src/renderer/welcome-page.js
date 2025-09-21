// Welcome Page JavaScript - Arc Browser Inspired Onboarding

class WelcomePage {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 5;
        this.userData = {
            name: '',
            location: '',
            theme: 'dark',
            searchEngine: 'google',
            features: {
                adblock: true,
                passwordManager: true,
                autofill: true,
                weather: true
            }
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateProgress();
        this.setupFormValidation();
        this.setupThemeSelection();
        this.setupSearchEngineSelection();
        this.setupFeatureToggles();
        this.setupScrollIndicator();
    }

    setupEventListeners() {
        // Location detection
        const detectLocationBtn = document.getElementById('detect-location');
        if (detectLocationBtn) {
            detectLocationBtn.addEventListener('click', () => this.detectLocation());
        }

        // Form validation
        const nameInput = document.getElementById('user-name');
        if (nameInput) {
            nameInput.addEventListener('input', () => this.validateStep2());
        }

        // Skip setup
        const skipBtn = document.querySelector('.skip-btn');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => this.skipSetup());
        }
    }

    setupScrollIndicator() {
        const scrollIndicator = document.getElementById('scroll-indicator');
        if (scrollIndicator) {
            // Hide scroll indicator when user starts scrolling
            let scrollTimeout;
            window.addEventListener('scroll', () => {
                scrollIndicator.style.opacity = '0';
                clearTimeout(scrollTimeout);
                
                // Show indicator again if user stops scrolling for 3 seconds
                scrollTimeout = setTimeout(() => {
                    if (window.scrollY < 100) {
                        scrollIndicator.style.opacity = '1';
                    }
                }, 3000);
            });

            // Hide indicator when user reaches bottom
            window.addEventListener('scroll', () => {
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const windowHeight = window.innerHeight;
                const documentHeight = document.documentElement.scrollHeight;
                
                if (scrollTop + windowHeight >= documentHeight - 100) {
                    scrollIndicator.style.opacity = '0';
                }
            });
        }
    }

    setupFormValidation() {
        const nameInput = document.getElementById('user-name');
        const step2Next = document.getElementById('step2-next');
        
        if (nameInput && step2Next) {
            nameInput.addEventListener('input', () => {
                this.userData.name = nameInput.value.trim();
                this.validateStep2();
            });
        }
    }

    validateStep2() {
        const nameInput = document.getElementById('user-name');
        const step2Next = document.getElementById('step2-next');
        
        if (nameInput && step2Next) {
            const isValid = nameInput.value.trim().length > 0;
            step2Next.disabled = !isValid;
            
            if (isValid) {
                step2Next.classList.add('primary');
                step2Next.classList.remove('secondary');
            } else {
                step2Next.classList.add('secondary');
                step2Next.classList.remove('primary');
            }
        }
    }

    setupThemeSelection() {
        const themeOptions = document.querySelectorAll('.theme-option');
        
        themeOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove previous selection
                themeOptions.forEach(opt => opt.classList.remove('selected'));
                
                // Add selection to clicked option
                option.classList.add('selected');
                
                // Update user data
                this.userData.theme = option.dataset.theme;
                
                // Apply theme preview
                this.applyThemePreview(option.dataset.theme);
            });
        });

        // Set default selection
        const defaultTheme = document.querySelector('.theme-option[data-theme="dark"]');
        if (defaultTheme) {
            defaultTheme.click();
        }
    }

    setupSearchEngineSelection() {
        const engineOptions = document.querySelectorAll('.search-engine-option');
        
        engineOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove previous selection
                engineOptions.forEach(opt => opt.classList.remove('selected'));
                
                // Add selection to clicked option
                option.classList.add('selected');
                
                // Update user data
                this.userData.searchEngine = option.dataset.engine;
            });
        });

        // Set default selection
        const defaultEngine = document.querySelector('.search-engine-option[data-engine="google"]');
        if (defaultEngine) {
            defaultEngine.click();
        }
    }

    setupFeatureToggles() {
        const toggles = document.querySelectorAll('.toggle-switch input');
        
        toggles.forEach(toggle => {
            toggle.addEventListener('change', () => {
                const feature = toggle.id.replace('-toggle', '');
                this.userData.features[feature] = toggle.checked;
            });
        });
    }

    applyThemePreview(theme) {
        // This would apply a preview of the theme to the welcome page
        // For now, we'll just store the selection
        console.log(`Theme preview applied: ${theme}`);
    }

    async detectLocation() {
        const locationInput = document.getElementById('user-location');
        const detectBtn = document.getElementById('detect-location');
        const locationHelp = document.querySelector('.location-help');
        
        if (!locationInput || !detectBtn) return;

        // Show loading state
        detectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        detectBtn.disabled = true;
        
        if (locationHelp) {
            locationHelp.textContent = 'Detecting your location...';
            locationHelp.style.color = 'var(--warning-color)';
        }

        try {
            // Try to get location from browser
            if (navigator.geolocation) {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 10000,
                        enableHighAccuracy: false
                    });
                });

                const { latitude, longitude } = position.coords;
                
                // Reverse geocoding to get city name
                const location = await this.reverseGeocode(latitude, longitude);
                
                if (location) {
                    locationInput.value = location;
                    this.userData.location = location;
                    
                    if (locationHelp) {
                        locationHelp.textContent = 'Location detected successfully!';
                        locationHelp.style.color = 'var(--success-color)';
                    }
                } else {
                    throw new Error('Could not determine location name');
                }
            } else {
                throw new Error('Geolocation not supported');
            }
        } catch (error) {
            console.error('Location detection failed:', error);
            
            if (locationHelp) {
                locationHelp.textContent = 'Could not detect location. Please enter manually.';
                locationHelp.style.color = 'var(--error-color)';
            }
        } finally {
            // Reset button
            detectBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
            detectBtn.disabled = false;
        }
    }

    async reverseGeocode(lat, lng) {
        try {
            // Use a free geocoding service
            const response = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
            );
            
            if (!response.ok) {
                throw new Error('Geocoding service unavailable');
            }
            
            const data = await response.json();
            
            if (data.city && data.countryName) {
                return `${data.city}, ${data.countryName}`;
            } else if (data.locality && data.countryName) {
                return `${data.locality}, ${data.countryName}`;
            } else {
                return null;
            }
        } catch (error) {
            console.error('Reverse geocoding failed:', error);
            return null;
        }
    }

    nextStep() {
        if (this.currentStep < this.totalSteps) {
            this.hideCurrentStep();
            this.currentStep++;
            this.showCurrentStep();
            this.updateProgress();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.hideCurrentStep();
            this.currentStep--;
            this.showCurrentStep();
            this.updateProgress();
        }
    }

    hideCurrentStep() {
        const currentStepElement = document.getElementById(`step-${this.currentStep}`);
        if (currentStepElement) {
            currentStepElement.classList.remove('active');
            currentStepElement.style.display = 'none';
        }
    }

    showCurrentStep() {
        const currentStepElement = document.getElementById(`step-${this.currentStep}`);
        if (currentStepElement) {
            currentStepElement.style.display = 'block';
            // Force reflow to ensure display change is applied
            currentStepElement.offsetHeight;
            currentStepElement.classList.add('active');
        }
    }

    updateProgress() {
        const progressFill = document.getElementById('progress-fill');
        const steps = document.querySelectorAll('.step');
        
        if (progressFill) {
            const progressPercentage = (this.currentStep / this.totalSteps) * 100;
            progressFill.style.width = `${progressPercentage}%`;
        }

        // Update step indicators
        steps.forEach((step, index) => {
            const stepNumber = index + 1;
            step.classList.remove('active', 'completed');
            
            if (stepNumber < this.currentStep) {
                step.classList.add('completed');
            } else if (stepNumber === this.currentStep) {
                step.classList.add('active');
            }
        });
    }

    async finishSetup() {
        try {
            // Show loading state
            const finishBtn = document.querySelector('#step-5 .welcome-btn.primary');
            if (finishBtn) {
                const originalText = finishBtn.innerHTML;
                finishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting up...';
                finishBtn.disabled = true;
            }

            // Save user data to localStorage
            this.saveUserData();

            // Apply settings to the browser
            await this.applySettings();

            // Mark welcome as completed
            localStorage.setItem('nuru-welcome-completed', 'true');
            localStorage.setItem('nuru-welcome-date', new Date().toISOString());

            // Show completion message
            this.showCompletionMessage();

            // Redirect to main browser after a delay
            setTimeout(() => {
                this.redirectToBrowser();
            }, 2000);

        } catch (error) {
            console.error('Setup completion failed:', error);
            this.showErrorMessage('Failed to complete setup. Please try again.');
        }
    }

    saveUserData() {
        // Save to localStorage for persistence
        localStorage.setItem('nuru-user-data', JSON.stringify(this.userData));
        
        // Also save individual settings for easy access
        localStorage.setItem('nuru-user-name', this.userData.name);
        localStorage.setItem('nuru-user-location', this.userData.location);
        localStorage.setItem('nuru-theme', this.userData.theme);
        localStorage.setItem('nuru-search-engine', this.userData.searchEngine);
        localStorage.setItem('nuru-features', JSON.stringify(this.userData.features));
    }

    async applySettings() {
        try {
            // Send settings to main process via IPC
            if (window.electronAPI && window.electronAPI.saveAllSettings) {
                const settings = {
                    theme: this.userData.theme,
                    search_engine: this.getSearchEngineConfig(this.userData.searchEngine),
                    features: this.userData.features,
                    cards: {
                        weatherLocation: this.userData.location,
                        weatherTemperatureUnit: 'celsius'
                    },
                    welcomeCompleted: true
                };

                await window.electronAPI.saveAllSettings(settings);
            }
        } catch (error) {
            console.error('Failed to apply settings:', error);
            throw error;
        }
    }

    getSearchEngineConfig(engine) {
        const engines = {
            google: {
                name: 'google',
                url: 'https://www.google.com/search?q=',
                icon: 'fab fa-google'
            },
            duckduckgo: {
                name: 'duckduckgo',
                url: 'https://duckduckgo.com/?q=',
                icon: 'fas fa-search'
            },
            bing: {
                name: 'bing',
                url: 'https://www.bing.com/search?q=',
                icon: 'fab fa-microsoft'
            },
            yahoo: {
                name: 'yahoo',
                url: 'https://search.yahoo.com/search?p=',
                icon: 'fas fa-yahoo'
            }
        };

        return engines[engine] || engines.google;
    }

    showCompletionMessage() {
        const step5 = document.getElementById('step-5');
        if (step5) {
            step5.innerHTML = `
                <div class="step-content">
                    <div class="completion-message">
                        <div class="completion-icon">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <h2>Setup Complete!</h2>
                        <p>Welcome to Nuru Browser, ${this.userData.name || 'User'}! Your personalized browsing experience is ready.</p>
                        <div class="completion-features">
                            <div class="feature-item">
                                <i class="fas fa-palette"></i>
                                <span>${this.userData.theme.charAt(0).toUpperCase() + this.userData.theme.slice(1)} theme applied</span>
                            </div>
                            <div class="feature-item">
                                <i class="fas fa-search"></i>
                                <span>${this.userData.searchEngine.charAt(0).toUpperCase() + this.userData.searchEngine.slice(1)} search configured</span>
                            </div>
                            <div class="feature-item">
                                <i class="fas fa-shield-alt"></i>
                                <span>Privacy features enabled</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Add completion styles
            const style = document.createElement('style');
            style.textContent = `
                .completion-message {
                    text-align: center;
                    animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                }
                
                .completion-icon {
                    font-size: 4rem;
                    color: var(--success-color);
                    margin-bottom: var(--space-lg);
                    animation: bounce 1s ease-in-out;
                }
                
                .completion-message h2 {
                    font-size: 2.5rem;
                    font-weight: 700;
                    margin-bottom: var(--space-md);
                    color: var(--text-primary);
                }
                
                .completion-message p {
                    font-size: 1.125rem;
                    color: var(--text-secondary);
                    margin-bottom: var(--space-2xl);
                    line-height: 1.6;
                }
                
                .completion-features {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-md);
                    align-items: center;
                }
                
                .completion-features .feature-item {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    padding: var(--space-sm) var(--space-md);
                    background: var(--glass-bg);
                    backdrop-filter: var(--glass-blur);
                    border: 1px solid var(--glass-border);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-weight: 500;
                }
                
                .completion-features .feature-item i {
                    color: var(--success-color);
                }
                
                @keyframes bounce {
                    0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                    40% { transform: translateY(-10px); }
                    60% { transform: translateY(-5px); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    showErrorMessage(message) {
        // Create error overlay
        const errorOverlay = document.createElement('div');
        errorOverlay.className = 'error-overlay';
        errorOverlay.innerHTML = `
            <div class="error-content">
                <div class="error-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Setup Error</h3>
                <p>${message}</p>
                <button class="welcome-btn primary" onclick="this.parentElement.parentElement.remove()">
                    Try Again
                </button>
            </div>
        `;

        // Add error styles
        const style = document.createElement('style');
        style.textContent = `
            .error-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                animation: fadeIn 0.3s ease;
            }
            
            .error-content {
                background: var(--glass-bg);
                backdrop-filter: var(--glass-blur);
                border: 1px solid var(--glass-border);
                border-radius: var(--radius-lg);
                padding: var(--space-2xl);
                text-align: center;
                max-width: 400px;
                margin: var(--space-lg);
            }
            
            .error-icon {
                font-size: 3rem;
                color: var(--error-color);
                margin-bottom: var(--space-lg);
            }
            
            .error-content h3 {
                font-size: 1.5rem;
                font-weight: 600;
                color: var(--text-primary);
                margin-bottom: var(--space-md);
            }
            
            .error-content p {
                color: var(--text-secondary);
                margin-bottom: var(--space-xl);
                line-height: 1.6;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(errorOverlay);
    }

    async skipSetup() {
        // Set default settings
        this.userData = {
            name: 'User',
            location: '',
            theme: 'dark',
            searchEngine: 'google',
            features: {
                adblock: true,
                passwordManager: true,
                autofill: true,
                weather: false
            }
        };

        // Save and apply settings
        this.saveUserData();
        await this.applySettings();

        // Mark welcome as completed in both localStorage and main process
        localStorage.setItem('nuru-welcome-completed', 'true');
        localStorage.setItem('nuru-welcome-skipped', 'true');

        // Also save to main process settings
        if (window.electronAPI && window.electronAPI.saveAllSettings) {
            await window.electronAPI.saveAllSettings({
                welcomeCompleted: true
            });
        }

        // Redirect to browser
        this.redirectToBrowser();
    }

    redirectToBrowser() {
        // Send message to main process to close welcome and open main browser
        if (window.electronAPI && window.electronAPI.closeWelcome) {
            window.electronAPI.closeWelcome();
        } else {
            // Fallback: try to navigate to main page
            window.location.href = '../index.html';
        }
    }
}

// Global functions for HTML onclick handlers
function nextStep() {
    if (window.welcomePage) {
        window.welcomePage.nextStep();
    }
}

function prevStep() {
    if (window.welcomePage) {
        window.welcomePage.prevStep();
    }
}

function finishSetup() {
    if (window.welcomePage) {
        window.welcomePage.finishSetup();
    }
}

function skipSetup() {
    if (window.welcomePage) {
        window.welcomePage.skipSetup();
    }
}

// Initialize welcome page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.welcomePage = new WelcomePage();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, pause any ongoing animations
        document.body.style.animationPlayState = 'paused';
    } else {
        // Page is visible, resume animations
        document.body.style.animationPlayState = 'running';
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    // Recalculate any size-dependent elements
    if (window.welcomePage) {
        window.welcomePage.updateProgress();
    }
});

// Handle keyboard navigation
document.addEventListener('keydown', (event) => {
    if (window.welcomePage) {
        switch (event.key) {
            case 'ArrowRight':
            case 'Enter':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    nextStep();
                }
                break;
            case 'ArrowLeft':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    prevStep();
                }
                break;
            case 'Escape':
                event.preventDefault();
                skipSetup();
                break;
        }
    }
});
