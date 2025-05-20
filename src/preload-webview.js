// Preload script for webview contents
// Overrides navigator.userAgent and appVersion to remove Electron token

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
