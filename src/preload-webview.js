// Preload script for webview contents
// Overrides navigator.userAgent and appVersion to remove Electron token

// Disable social login blocking feature temporarily
const SOCIAL_LOGIN_BLOCK_DISABLED = true;

(function() {
  try {
    // Capture original UA
    const originalUA = navigator.userAgent;
    // Strip Electron/<version>
    const pureUA = originalUA.replace(/\s?Electron\/[\d\.]+/, '');
    // Define new userAgent property
    Object.defineProperty(navigator, 'userAgent', {
      get: () => pureUA,
      configurable: false
    });
    // Override appVersion similarly
    const originalAV = navigator.appVersion;
    const pureAV = originalAV.replace(/\s?Electron\/[\d\.]+/, '');
    Object.defineProperty(navigator, 'appVersion', {
      get: () => pureAV,
      configurable: false
    });
    // Adjust userAgentData if present
    if (navigator.userAgentData && navigator.userAgentData.brands) {
      navigator.userAgentData.brands = navigator.userAgentData.brands.filter(b => b.brand !== 'Electron');
    }
    console.log('Webview preload: userAgent overridden to', pureUA);
  } catch (err) {
    console.error('Webview preload error:', err);
  }
})();

// Media progress injection
(function() {
  const {ipcRenderer} = require('electron');
  function setupMediaProgress() {
    const selector = 'audio, video';
    const observed = new Set();
    function attachListeners() {
      document.querySelectorAll(selector).forEach(el => {
        if (!observed.has(el)) {
          observed.add(el);
          el.addEventListener('timeupdate', () => {
            if (el.duration > 0) {
              const prog = el.currentTime / el.duration;
              ipcRenderer.sendToHost('media-progress', prog);
            }
          });
          el.addEventListener('ended', () => {
            ipcRenderer.sendToHost('media-progress', 0);
          });
          el.addEventListener('play', () => {
            ipcRenderer.sendToHost('media-playing', true);
          });
          el.addEventListener('pause', () => {
            ipcRenderer.sendToHost('media-playing', false);
          });
        }
      });
    }
    new MutationObserver(attachListeners).observe(document, { childList: true, subtree: true });
    window.addEventListener('DOMContentLoaded', attachListeners);
  }
  setupMediaProgress();
})();

// Add social login detection
(function() {
  if (SOCIAL_LOGIN_BLOCK_DISABLED) return;
  const {ipcRenderer} = require('electron');
  // Send tooltip notification only once per page load
  let tooltipNotified = false;
  function detectSocialLogin() {
    const loginSelectors = ['button', 'a', 'input[type="button"]', 'input[type="submit"]'];
    const socialProviders = [
      { name: 'Google', patterns: ['google', 'accounts.google.com'] },
      { name: 'Facebook', patterns: ['facebook', 'facebook.com'] },
      { name: 'Twitter', patterns: ['twitter', 'twitter.com'] },
      { name: 'GitHub', patterns: ['github', 'github.com'] },
      { name: 'LinkedIn', patterns: ['linkedin', 'linkedin.com'] },
      { name: 'Apple', patterns: ['apple', 'apple.com'] }
    ];
    const loginKeywords = /(sign in|sign up|login|signup|connect|continue|authenticate|auth)/i;
    let detected = false;
    // Known Google search button classes/ids
    const googleSearchClasses = ['gNO89b', 'btnK', 'btnI', 'gbqfbb', 'gbqfba', 'gbqfb', 'tsf', 'tsf-p', 'tsf-n'];
    const googleSearchIds = ['gbqfbb', 'gbqfba', 'gbqfb', 'btnK', 'btnI', 'gNO89b'];
    loginSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const text = (el.innerText || el.value || '').toLowerCase();
        const classList = Array.from(el.classList || []).join(' ').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const href = (el.getAttribute('href') || '').toLowerCase();
        const parentForm = el.closest('form');
        let isSocial = false;
        // Exclude Google search bar buttons
        if (
          googleSearchClasses.some(cls => classList.includes(cls)) ||
          googleSearchIds.some(gid => id === gid)
        ) {
          return;
        }
        // Exclude buttons in forms with action exactly '/' or search
        if (parentForm && (parentForm.action === '' || parentForm.action === '/' || /\/search/.test(parentForm.action))) {
          return;
        }
        // Only disable if:
        // 1. Inside a form whose action points to a known social provider
        if (parentForm && parentForm.action) {
          isSocial = socialProviders.some(provider => provider.patterns.some(pattern => parentForm.action.toLowerCase().includes(pattern)));
        }
        // 2. Or, element has BOTH:
        //    (a) at least two different attributes matching a provider pattern
        //    (b) at least one attribute contains a login/auth keyword (not just in the concatenated string)
        if (!isSocial) {
          let providerAttrs = [];
          let loginAttrs = [];
          for (const provider of socialProviders) {
            for (const pattern of provider.patterns) {
              if (text.includes(pattern)) providerAttrs.push('text');
              if (classList.includes(pattern)) providerAttrs.push('class');
              if (id.includes(pattern)) providerAttrs.push('id');
              if (ariaLabel.includes(pattern)) providerAttrs.push('aria');
              if (href.includes(pattern)) providerAttrs.push('href');
            }
          }
          if (loginKeywords.test(text)) loginAttrs.push('text');
          if (loginKeywords.test(classList)) loginAttrs.push('class');
          if (loginKeywords.test(id)) loginAttrs.push('id');
          if (loginKeywords.test(ariaLabel)) loginAttrs.push('aria');
          if (loginKeywords.test(href)) loginAttrs.push('href');
          // Require at least two different provider attributes AND at least one login keyword attribute
          const uniqueProviderAttrs = Array.from(new Set(providerAttrs));
          const uniqueLoginAttrs = Array.from(new Set(loginAttrs));
          if (uniqueProviderAttrs.length >= 2 && uniqueLoginAttrs.length >= 1) {
            isSocial = true;
          }
        }
        if (isSocial) {
          // Visually disable the element
          el.style.filter = 'grayscale(100%)';
          el.style.cursor = 'not-allowed';
          // Prevent click and show tooltip notification once
          el.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!tooltipNotified) {
              ipcRenderer.sendToHost('social-login-tooltip');
              tooltipNotified = true;
            }
          }, true);
          detected = true;
        }
      });
    });
    // Iframe detection (unchanged)
    socialProviders.forEach(provider => {
      provider.patterns.forEach(pattern => {
        document.querySelectorAll(`iframe[src*="${pattern}"]`).forEach(iframe => {
          iframe.style.filter = 'grayscale(100%)';
          iframe.style.pointerEvents = 'none';
          detected = true;
        });
      });
    });
    if (detected) ipcRenderer.sendToHost('social-login-detected');
  }
  window.addEventListener('DOMContentLoaded', detectSocialLogin);
  new MutationObserver(detectSocialLogin).observe(document, { childList: true, subtree: true });
})();

// Override window.open to detect pop-up modal social login
(function() {
  if (SOCIAL_LOGIN_BLOCK_DISABLED) return;
  const socialDomains = ['facebook.com', 'accounts.google.com', 'api.twitter.com', 'github.com', 'linkedin.com', 'apple.com'];
  const origOpen = window.open;
  window.open = function(url, name, specs) {
    if (socialDomains.some(d => url.includes(d))) {
      const {ipcRenderer} = require('electron');
      ipcRenderer.sendToHost('social-login-detected');
      return { closed: true, close: () => {}, focus: () => {} };
    }
    return origOpen.call(this, url, name, specs);
  };
})();

// Enhanced theme-color injection with robust image preservation
const { ipcRenderer } = require('electron');

// Domain exclusion list - websites where theming should be disabled
const THEME_EXCLUDED_DOMAINS = [
    'google.com',
    'googlevideo.com',
    'ytimg.com',
    'gstatic.com',
    'googleusercontent.com',
    'gmail.com',
    'drive.google.com',
    'docs.google.com',
    'sheets.google.com',
    'slides.google.com'
];

// Function to check if current domain should be excluded from theming
function shouldExcludeFromTheme() {
    const hostname = window.location.hostname.toLowerCase();
    return THEME_EXCLUDED_DOMAINS.some(domain => {
        return hostname === domain || hostname.endsWith('.' + domain);
    });
}

// Helper functions to identify image-related elements
function hasImageRelatedClass(element) {
    // Safely check className
    const className = (element.className && typeof element.className === 'string') 
        ? element.className.toLowerCase() 
        : '';
        
    const imageKeywords = [
        'thumbnail', 'thumb', 'image', 'photo', 'picture', 
        'avatar', 'preview', 'media', 'cover', 'poster',
        'img', 'pic', 'gallery', 'slideshow'
    ];
    
    return imageKeywords.some(keyword => className.includes(keyword));
}

function hasImageRelatedAttribute(element) {
    const id = (element.id || '').toLowerCase();
    const role = (element.getAttribute('role') || '').toLowerCase();
    const dataAttrs = Array.from(element.attributes || [])
        .filter(attr => attr.name.startsWith('data-'))
        .map(attr => attr.value.toLowerCase())
        .join(' ');
    
    const imageKeywords = [
        'thumbnail', 'thumb', 'image', 'photo', 'picture', 
        'avatar', 'preview', 'media', 'cover', 'poster',
        'img', 'pic', 'gallery', 'slideshow'
    ];
    
    return imageKeywords.some(keyword => 
        id.includes(keyword) || 
        role.includes(keyword) ||
        dataAttrs.includes(keyword)
    );
}

// Enhanced background stripping that's more careful about images
function stripDecorativeBackgrounds() {
    const elements = document.querySelectorAll('*');
    
    elements.forEach(el => {
        // Skip preserved elements
        if (shouldPreserveElement(el)) {
            return;
        }
        
        try {
            const computedStyle = window.getComputedStyle(el);
            const bgImage = computedStyle.backgroundImage;
            
            if (bgImage && bgImage !== 'none') {
                // Check if background is gradient (decorative)
                if (bgImage.includes('gradient')) {
                    el.style.setProperty('background-image', 'none', 'important');
                    return;
                }
                
                // Check if background is a data URI image or actual image URL
                const imageUrlPattern = /url\(['"]?(.*?)['"]?\)/;
                const match = bgImage.match(imageUrlPattern);
                
                if (match) {
                    const url = match[1];
                    
                    // Preserve actual image URLs and data URIs
                    if (url.startsWith('data:image/') || 
                        /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(url)) {
                        return; // Keep this background
                    }
                    
                    // Remove decorative/non-image backgrounds
                    el.style.setProperty('background-image', 'none', 'important');
                }
            }
        } catch (err) {
            // Skip elements that can't be processed
        }
    });
}

// Enhanced mutation observer for dynamic content
function setupMutationObserver(bg, text) {
    const observer = new MutationObserver((mutations) => {
        let hasNewElements = false;
        
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    hasNewElements = true;
                }
            });
        });
        
        if (hasNewElements) {
            // Debounce the theme application
            clearTimeout(window.themeTimeout);
            window.themeTimeout = setTimeout(() => {
                applyThemeToNewElements(bg, text);
                stripDecorativeBackgroundsFromNewNodes();
            }, 100);
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function applyThemeToNewElements(bg, text) {
    // Find recently added elements (those without our theme marker)
    const newElements = document.querySelectorAll('*:not([data-nuru-themed])');
    
    newElements.forEach(el => {
        if (!shouldPreserveElement(el)) {
            try {
                el.style.setProperty('background-color', bg, 'important');
                el.style.setProperty('color', text, 'important');
                el.setAttribute('data-nuru-themed', 'true');
            } catch (err) {
                // Skip elements that can't be styled
            }
        } else {
            // Mark preserved elements so we don't process them again
            el.setAttribute('data-nuru-themed', 'preserved');
        }
    });
}

function stripDecorativeBackgroundsFromNewNodes() {
    // Only process new elements
    const newElements = document.querySelectorAll('*:not([data-nuru-bg-checked])');
    
    newElements.forEach(el => {
        el.setAttribute('data-nuru-bg-checked', 'true');
        
        if (shouldPreserveElement(el)) {
            return;
        }
        
        try {
            const computedStyle = window.getComputedStyle(el);
            const bgImage = computedStyle.backgroundImage;
            
            if (bgImage && bgImage !== 'none' && bgImage.includes('gradient')) {
                el.style.setProperty('background-image', 'none', 'important');
            }
        } catch (err) {
            // Skip elements that can't be processed
        }
    });
}

// Main initialization with settings fetch
function initializeTheme() {
    // Fetch user settings and override exclusion list
    ipcRenderer.invoke('get-settings')
        .then(settings => {
            if (!settings.applyThemeToWebpages) {
                console.log('Nuru theme: injection disabled by setting');
                return;
            }
            // Load dynamic exclusion domains from settings
            const userExclusions = settings.themeExcludedDomains || [];
            THEME_EXCLUDED_DOMAINS.length = 0;
            THEME_EXCLUDED_DOMAINS.push(...userExclusions);
            // Skip theming on excluded domains
            if (shouldExcludeFromTheme()) {
                console.log('Nuru theme: Skipping theme application for', window.location.hostname);
                return;
            }
            let bg, text;
            switch (settings.theme) {
                case 'light': bg = '#ffffff'; text = '#333333'; break;
                case 'blue': bg = '#e0f7fa'; text = '#012f41'; break;
                case 'green': bg = '#e8f5e9'; text = '#1b5e20'; break;
                case 'purple': bg = '#f3e5f5'; text = '#4a148c'; break;
                case 'dark':
                default:
                    bg = '#1f1f1f';
                    text = '#f2f2f2';
            }
            console.log('Nuru theme: Injecting CSS theme to', window.location.hostname);
            injectThemeCSS(bg, text);
        })
        .catch(err => console.error('Failed to get settings for theme injection:', err));
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTheme);
} else {
    initializeTheme();
}

// Also initialize on page changes for SPAs
window.addEventListener('popstate', () => {
    setTimeout(() => {
        // Check domain again in case of navigation
        if (!shouldExcludeFromTheme()) {
            initializeTheme();
        }
    }, 100);
});

// Optional: Add a function to dynamically add/remove domains from exclusion list
function updateExcludedDomains(newDomains) {
    THEME_EXCLUDED_DOMAINS.length = 0; // Clear existing
    THEME_EXCLUDED_DOMAINS.push(...newDomains);
    
    // Re-evaluate current page
    const currentlyExcluded = shouldExcludeFromTheme();
    const hasTheme = document.getElementById('nuru-theme-override');
    
    if (currentlyExcluded && hasTheme) {
        // Remove theme if now excluded
        hasTheme.remove();
        location.reload(); // Reload to restore original appearance
    } else if (!currentlyExcluded && !hasTheme) {
        // Apply theme if no longer excluded
        initializeTheme();
    }
}

// Expose function for IPC communication if needed
if (typeof ipcRenderer !== 'undefined') {
    ipcRenderer.on('update-excluded-domains', (event, domains) => {
        updateExcludedDomains(domains);
    });
}

// Cleanup interval to fix any missed elements
setInterval(() => {
    // Only run if page is visible to avoid unnecessary work
    if (!document.hidden) {
        stripDecorativeBackgrounds();
    }
}, 3000);

// Enhanced content preservation system - replace the existing preservation functions
const PRESERVATION_RULES = {
    // Direct element selectors that should never be themed
    PROTECTED_ELEMENTS: [
        'dialog', 'header', 'img', 'video', 'audio', 'canvas', 'svg', 'picture', 'figure', 'embed', 'object', 'iframe',
        'input[type="image"]', 'input[type="file"]', 'input[type="color"]', 'input[type="range"]'
    ],
    // Class name patterns (case-insensitive)
    PROTECTED_CLASS_PATTERNS: [
        'image', 'img', 'photo', 'picture', 'pic', 'thumbnail', 'thumb', 'avatar', 'profile',
        'cover', 'banner', 'hero', 'poster', 'preview', 'media', 'gallery', 'slideshow',
        'carousel', 'slider', 'lightbox', 'modal', 'popup', 'overlay', 'backdrop',
        'logo', 'icon', 'badge', 'emoji', 'sticker', 'chart', 'graph', 'diagram',
        'map', 'canvas', 'drawing', 'art', 'illustration', 'screenshot', 'qr',
        'captcha', 'advertisement', 'ad', 'sponsor', 'promo'
    ],
    // ID patterns (case-insensitive)
    PROTECTED_ID_PATTERNS: [
        'image', 'img', 'photo', 'picture', 'thumbnail', 'avatar', 'cover', 'banner',
        'hero', 'poster', 'preview', 'media', 'gallery', 'logo', 'icon', 'chart', 'map'
    ],
    // Data attribute patterns
    PROTECTED_DATA_PATTERNS: [
        'src', 'background', 'image', 'photo', 'thumbnail', 'avatar', 'cover', 'poster'
    ],
    // Site-specific selectors for popular websites
    SITE_SPECIFIC_SELECTORS: {
        'youtube.com': [
            'ytd-thumbnail', '.ytd-thumbnail', 'yt-image', '.yt-image', '.yt-simple-endpoint',
            '.ytd-video-preview', '.ytp-videowall-still', '.yt-thumb', '#player-container'
        ],
        'google.com': [
            '.islrc', '.isv-r', '.bRMDJf', '.irc_mi', '.irc_rii', '.irc_c', '.irc_mc', '.irc_t',
            '.rg_i', '.t0fcAb', '.mVDMnf', '.KAlRDb', '.wXeWr', '.islib', '.mJxzWe'
        ],
        'twitter.com': [
            '[data-testid="tweetPhoto"]', '[data-testid="card.layoutLarge.media"]',
            '.css-9pa8cd', '.r-1p0dtai', '.r-1mlwlqe', '.r-1d2f490'
        ],
        'instagram.com': [
            '._aagv', '._aagu', '._acat', '._ac7v', '.x5yr21d', '.xu96u03'
        ],
        'facebook.com': [
            '[data-pagelet*="photo"]', '[data-pagelet*="image"]', '.spotlight',
            '._2di8', '._46-f', '._4-eo', '._5dec', '._3chq'
        ],
        'reddit.com': [
            '.ImageBox-image', '.media-preview-content', '._2_tDEnGMLxpM6uOa2kaDB3',
            '.Post-image', '.media-element'
        ]
    }
};

// Enhanced function to check if element should be preserved
function shouldPreserveElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    
    // Preserve elements with ARIA dialog roles
    const tagName = element.tagName.toLowerCase();
    const className = (element.className && typeof element.className === 'string') ? element.className.toLowerCase() : '';
    const id = (element.id || '').toLowerCase();
    const hostname = window.location.hostname.toLowerCase();
    // 1. Always preserve media and interactive elements
    if (PRESERVATION_RULES.PROTECTED_ELEMENTS.some(sel => element.matches(sel))) return true;
    // 2. Check if element contains protected elements as direct children
    if (PRESERVATION_RULES.PROTECTED_ELEMENTS.some(sel => element.querySelector(sel))) return true;
    // 3. Check for background images (actual images, not gradients)
    if (hasActualBackgroundImage(element)) return true;
    // 4. Check class name patterns
    if (PRESERVATION_RULES.PROTECTED_CLASS_PATTERNS.some(pattern => className.includes(pattern))) return true;
    // 5. Check ID patterns
    if (PRESERVATION_RULES.PROTECTED_ID_PATTERNS.some(pattern => id.includes(pattern))) return true;
    // 6. Check data attributes
    const dataAttrs = Array.from(element.attributes || [])
        .filter(attr => attr.name.startsWith('data-'))
        .map(attr => `${attr.name}=${attr.value}`.toLowerCase())
        .join(' ');
    if (PRESERVATION_RULES.PROTECTED_DATA_PATTERNS.some(pattern => dataAttrs.includes(pattern))) return true;
    // 7. Check site-specific selectors
    const siteSelectors = getSiteSpecificSelectors(hostname);
    if (siteSelectors.some(sel => { try { return element.matches(sel) || element.closest(sel); } catch { return false; } })) return true;
    // 8. Check for image-like characteristics
    if (hasImageLikeCharacteristics(element)) return true;
    // 9. Check for elements inside preserved parents
    if (element.closest('[data-nuru-preserve="true"]')) return true;
    return false;
}

// Function to detect actual background images (not gradients)
function hasActualBackgroundImage(element) {
    try {
        const computedStyle = window.getComputedStyle(element);
        const bgImage = computedStyle.backgroundImage;
        if (!bgImage || bgImage === 'none') return false;
        if (bgImage.includes('gradient')) return false;
        const imageUrlPattern = /url\(['"]?(.*?)['"]?\)/g;
        let match;
        while ((match = imageUrlPattern.exec(bgImage)) !== null) {
            const url = match[1];
            if (url.startsWith('data:image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)(\?|#|$)/i.test(url)) return true;
        }
    } catch { }
    return false;
}

// Get site-specific selectors for current domain
function getSiteSpecificSelectors(hostname) {
    const selectors = [];
    for (const [domain, domSelectors] of Object.entries(PRESERVATION_RULES.SITE_SPECIFIC_SELECTORS)) {
        if (hostname.includes(domain)) selectors.push(...domSelectors);
    }
    return selectors;
}

// Check for image-like characteristics
function hasImageLikeCharacteristics(element) {
    try {
        const computedStyle = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20 || rect.width === 0 || rect.height === 0) return false;
        const aspectRatio = rect.width / rect.height;
        const isImageLikeRatio = aspectRatio >= 0.5 && aspectRatio <= 3;
        const position = computedStyle.position;
        const hasImageSizing = computedStyle.objectFit !== 'initial' || computedStyle.backgroundSize !== 'initial';
        const borderRadius = computedStyle.borderRadius;
        const hasRoundedCorners = borderRadius && borderRadius !== '0px';
        return isImageLikeRatio && (hasImageSizing || hasRoundedCorners || position === 'absolute');
    } catch { return false; }
}

// Inject theme CSS globally
function injectThemeCSS(bg, text) {
    const existingStyle = document.getElementById('nuru-theme-override');
    if (existingStyle) existingStyle.remove();
    const style = document.createElement('style');
    style.id = 'nuru-theme-override';
    style.textContent = `
        /* Apply theme to all elements and pseudo-elements */
        *, *::before, *::after {
            background-color: ${bg} !important;
            color: ${text} !important;
        }
    `;
    document.head.appendChild(style);
}