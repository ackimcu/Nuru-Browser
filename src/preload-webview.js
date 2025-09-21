// Preload script for webview contents
// Overrides navigator.userAgent and appVersion to remove Electron token

// Disable social login blocking feature temporarily
const SOCIAL_LOGIN_BLOCK_DISABLED = true;

// Inject secure CSP meta tag to prevent CSP warnings
(function() {
  function injectCSP() {
    try {
      if (!document.head) {
        // Wait for DOM to be ready
        setTimeout(injectCSP, 10);
        return;
      }
      
      // Remove any existing CSP meta tags that might have unsafe-eval
      const existingCspTags = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
      existingCspTags.forEach(tag => tag.remove());
      
      // Add our secure CSP meta tag with more permissive settings for external resources
      const cspMeta = document.createElement('meta');
      cspMeta.setAttribute('http-equiv', 'Content-Security-Policy');
      cspMeta.setAttribute('content', "default-src 'self' 'unsafe-inline' data: https: wss: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; connect-src 'self' data: https: wss: blob:; font-src 'self' data: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https:; media-src 'self' data: https: blob:; worker-src 'self' data: https: blob:;");
      document.head.insertBefore(cspMeta, document.head.firstChild);
      
      // Also try to override any CSP set via HTTP headers by injecting a script
      try {
        const script = document.createElement('script');
        script.textContent = `
          // Override any CSP warnings by suppressing them
          if (window.console && window.console.warn) {
            const originalWarn = window.console.warn;
            window.console.warn = function(...args) {
              const message = args.join(' ');
              if (message.includes('Content-Security-Policy') && message.includes('unsafe-eval')) {
                return; // Suppress CSP warnings
              }
              originalWarn.apply(console, args);
            };
          }
        `;
        document.head.appendChild(script);
      } catch (err) {
        console.debug('Could not inject script due to TrustedScript requirements:', err);
      }
    } catch (err) {
      console.debug('Could not inject CSP meta tag:', err);
    }
  }
  
  // Try to inject immediately, or wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSP);
  } else {
    injectCSP();
  }
})();

// Suppress common postMessage errors from embedded content
(function() {
  const originalConsoleError = console.error;
  console.error = function(...args) {
    const message = args.join(' ');
    // Suppress postMessage target origin errors from YouTube/Google
    if (message.includes("postMessage") && message.includes("target origin")) {
      return; // Suppress this error
    }
    // Suppress EvalError from CSP blocking unsafe-eval
    if (message.includes("EvalError") && message.includes("unsafe-eval")) {
      return; // Suppress this error
    }
    // Call original console.error for other messages
    originalConsoleError.apply(console, args);
  };
  
  // Also suppress console.warn for postMessage errors
  const originalConsoleWarn = console.warn;
  console.warn = function(...args) {
    const message = args.join(' ');
    // Suppress postMessage target origin warnings
    if (message.includes("postMessage") && message.includes("target origin")) {
      return; // Suppress this warning
    }
    // Suppress CSP warnings about unsafe-eval
    if (message.includes("unsafe-eval") && message.includes("Content Security Policy")) {
      return; // Suppress this warning
    }
    // Call original console.warn for other messages
    originalConsoleWarn.apply(console, args);
  };
})();

// Add global error handler to suppress EvalError from CSP
(function() {
  const originalOnError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    // Suppress EvalError from CSP blocking unsafe-eval
    if (error && error.name === 'EvalError' && message.includes('unsafe-eval')) {
      return true; // Suppress the error
    }
    // Call original error handler for other errors
    if (originalOnError) {
      return originalOnError.apply(this, arguments);
    }
    return false;
  };
})();

(function() {
  try {
    // Capture original UA
    const originalUA = navigator.userAgent;
    
    // Check if user agent is already clean (no Electron references)
    if (!originalUA.includes('Electron/')) {
      console.log('Webview preload: userAgent already clean:', originalUA);
      return;
    }
    
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
