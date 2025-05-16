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
  function detectSocialLogin() {
    const loginSelectors = ['button', 'a', 'input[type="button"]', 'input[type="submit"]'];
    const socialDomains = ['facebook.com','accounts.google.com','api.twitter.com','github.com','linkedin.com','apple.com'];
    let detected = false;
    // Inline button/link detection
    loginSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const text = (el.innerText || el.value || '').toLowerCase();
        if (socialDomains.some(d => text.includes(d.split('.')[0])) && /(sign in|sign up|login|signup)/.test(text)) {
          el.style.filter = 'grayscale(100%)';
          el.style.pointerEvents = 'none';
          el.disabled = true;
          detected = true;
        }
      });
    });
    // Iframe detection
    socialDomains.forEach(domain => {
      document.querySelectorAll(`iframe[src*="${domain}"]`).forEach(iframe => {
        iframe.style.filter = 'grayscale(100%)';
        iframe.style.pointerEvents = 'none';
        detected = true;
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
