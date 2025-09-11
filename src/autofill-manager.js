/**
 * Nuru Browser Autofill Manager
 * Handles form detection, password suggestions, and autofill functionality
 */

const { ipcMain } = require('electron');
const log = require('electron-log');
const PasswordManager = require('./password-manager');

class AutofillManager {
  constructor(userDataPath) {
    this.isEnabled = true;
    this.suggestions = [];
    this.currentDomain = null;
    this.passwordManager = null;
    this.userDataPath = userDataPath;
  }

  /**
   * Initialize password manager
   */
  initPasswordManager() {
    if (!this.passwordManager) {
      this.passwordManager = new PasswordManager(this.userDataPath);
    }
  }

  /**
   * Inject autofill script into webview
   * @param {Object} webview - Webview element
   */
  injectAutofillScript(webview) {
    if (!this.isEnabled) return;

    const script = `
      (function() {
        'use strict';
        
        // Password manager integration
        let passwordSuggestions = [];
        let currentDomain = window.location.hostname;
        let suggestionBox = null;
        let isPasswordField = false;
        let currentField = null;
        
        // Create suggestion box
        function createSuggestionBox() {
          if (suggestionBox) return suggestionBox;
          
          suggestionBox = document.createElement('div');
          suggestionBox.id = 'nuru-password-suggestions';
          suggestionBox.style.cssText = \`
            position: absolute;
            background: #1a1a1a;
            border: 1px solid #444;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 300px;
            min-width: 200px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            color: #f2f2f2;
            display: none;
          \`;
          
          document.body.appendChild(suggestionBox);
          return suggestionBox;
        }
        
        // Position suggestion box
        function positionSuggestionBox(field) {
          const rect = field.getBoundingClientRect();
          const box = createSuggestionBox();
          
          box.style.left = rect.left + 'px';
          box.style.top = (rect.bottom + 5) + 'px';
          box.style.width = Math.max(rect.width, 200) + 'px';
        }
        
        // Show password suggestions
        function showSuggestions(field, suggestions) {
          if (!suggestions || suggestions.length === 0) return;
          
          const box = createSuggestionBox();
          positionSuggestionBox(field);
          
          box.innerHTML = suggestions.map((suggestion, index) => \`
            <div class="suggestion-item" data-index="\${index}" style="
              padding: 14px;
              cursor: pointer;
              border-bottom: 1px solid #333;
              display: flex;
              align-items: center;
              gap: 12px;
              transition: background-color 0.2s ease;
            ">
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <div style="font-weight: 600; font-size: 14px; color: #f2f2f2;">\${suggestion.title}</div>
                  \${suggestion.isExactMatch ? '<span style="background: #4caf50; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 600;">EXACT</span>' : ''}
                  \${suggestion.isRecent ? '<span style="background: #2196f3; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 600;">RECENT</span>' : ''}
                </div>
                <div style="font-size: 12px; color: #888; margin-bottom: 2px;">\${suggestion.username}</div>
                <div style="font-size: 11px; color: #666; font-family: monospace;">\${suggestion.domain}</div>
                \${suggestion.daysSinceUsed !== null ? \`<div style="font-size: 10px; color: #999; margin-top: 2px;">Used \${suggestion.daysSinceUsed === 0 ? 'today' : suggestion.daysSinceUsed === 1 ? 'yesterday' : suggestion.daysSinceUsed + ' days ago'}</div>\` : ''}
              </div>
              <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <div style="
                  width: 10px;
                  height: 10px;
                  border-radius: 50%;
                  background: \${suggestion.strength === 'strong' ? '#4caf50' : 
                             suggestion.strength === 'medium' ? '#ff9800' : '#f44336'};
                  box-shadow: 0 0 4px \${suggestion.strength === 'strong' ? 'rgba(76, 175, 80, 0.3)' : 
                                        suggestion.strength === 'medium' ? 'rgba(255, 152, 0, 0.3)' : 'rgba(244, 67, 54, 0.3)'};
                "></div>
                <div style="
                  font-size: 9px;
                  color: \${suggestion.strength === 'strong' ? '#4caf50' : 
                          suggestion.strength === 'medium' ? '#ff9800' : '#f44336'};
                  font-weight: 600;
                  text-transform: uppercase;
                ">\${suggestion.strength}</div>
              </div>
            </div>
          \`).join('');
          
          // Add click handlers
          box.querySelectorAll('.suggestion-item').forEach((item, index) => {
            item.addEventListener('click', () => {
              fillForm(suggestions[index], field);
              hideSuggestions();
            });
            
            item.addEventListener('mouseenter', () => {
              item.style.backgroundColor = '#333';
            });
            
            item.addEventListener('mouseleave', () => {
              item.style.backgroundColor = 'transparent';
            });
          });
          
          box.style.display = 'block';
        }
        
        // Hide suggestions
        function hideSuggestions() {
          const box = document.getElementById('nuru-password-suggestions');
          if (box) {
            box.style.display = 'none';
          }
        }
        
        // Fill form with password data
        function fillForm(suggestion, passwordField) {
          // Find username field
          const usernameField = findUsernameField(passwordField);
          if (usernameField) {
            usernameField.value = suggestion.username;
            usernameField.dispatchEvent(new Event('input', { bubbles: true }));
            usernameField.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          // Fill password field
          passwordField.value = suggestion.password;
          passwordField.dispatchEvent(new Event('input', { bubbles: true }));
          passwordField.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Trigger form validation
          const form = passwordField.closest('form');
          if (form) {
            form.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        
        // Find username field near password field
        function findUsernameField(passwordField) {
          const form = passwordField.closest('form');
          if (!form) return null;
          
          // Common username field selectors
          const selectors = [
            'input[type="email"]',
            'input[type="text"][name*="user"]',
            'input[type="text"][name*="email"]',
            'input[type="text"][name*="login"]',
            'input[type="text"][id*="user"]',
            'input[type="text"][id*="email"]',
            'input[type="text"][id*="login"]',
            'input[type="text"][placeholder*="user"]',
            'input[type="text"][placeholder*="email"]',
            'input[type="text"][placeholder*="login"]'
          ];
          
          for (const selector of selectors) {
            const field = form.querySelector(selector);
            if (field && field !== passwordField) {
              return field;
            }
          }
          
          // Fallback: find any text input before password field
          const inputs = Array.from(form.querySelectorAll('input[type="text"], input[type="email"]'));
          const passwordIndex = inputs.indexOf(passwordField);
          if (passwordIndex > 0) {
            return inputs[passwordIndex - 1];
          }
          
          return null;
        }
        
        // Detect password fields
        function detectPasswordFields() {
          const passwordFields = document.querySelectorAll('input[type="password"]');
          
          passwordFields.forEach(field => {
            if (field.dataset.nuruAutofill) return; // Already processed
            
            field.dataset.nuruAutofill = 'true';
            
            // Add focus event
            field.addEventListener('focus', async (e) => {
              currentField = e.target;
              isPasswordField = true;
              
              // Request password suggestions
              try {
                const suggestions = await window.electronAPI.getPasswordSuggestions(currentDomain);
                if (suggestions && suggestions.length > 0) {
                  showSuggestions(e.target, suggestions);
                }
              } catch (error) {
                console.log('No password suggestions available');
              }
            });
            
            // Add blur event
            field.addEventListener('blur', (e) => {
              setTimeout(() => {
                if (!suggestionBox || !suggestionBox.contains(document.activeElement)) {
                  hideSuggestions();
                }
              }, 200);
            });
            
            // Add keydown event for keyboard navigation
            field.addEventListener('keydown', (e) => {
              const box = document.getElementById('nuru-password-suggestions');
              if (!box || box.style.display === 'none') return;
              
              const items = box.querySelectorAll('.suggestion-item');
              const current = box.querySelector('.suggestion-item.selected');
              let index = current ? Array.from(items).indexOf(current) : -1;
              
              switch (e.key) {
                case 'ArrowDown':
                  e.preventDefault();
                  index = Math.min(index + 1, items.length - 1);
                  break;
                case 'ArrowUp':
                  e.preventDefault();
                  index = Math.max(index - 1, 0);
                  break;
                case 'Enter':
                  e.preventDefault();
                  if (current) {
                    current.click();
                  }
                  return;
                case 'Escape':
                  hideSuggestions();
                  return;
              }
              
              // Update selection
              items.forEach((item, i) => {
                item.classList.toggle('selected', i === index);
                item.style.backgroundColor = i === index ? '#333' : 'transparent';
              });
            });
          });
        }
        
        // Detect login forms
        function detectLoginForms() {
          const forms = document.querySelectorAll('form');
          
          forms.forEach(form => {
            const passwordField = form.querySelector('input[type="password"]');
            if (!passwordField) return;
            
            // Add form submission handler
            form.addEventListener('submit', async (e) => {
              const usernameField = findUsernameField(passwordField);
              if (!usernameField) return;
              
              const entry = {
                domain: currentDomain,
                username: usernameField.value,
                password: passwordField.value,
                title: document.title || currentDomain
              };
              
              // Save password if it's a new login
              try {
                await window.electronAPI.savePasswordFromForm(entry);
              } catch (error) {
                console.log('Could not save password:', error);
              }
            });
          });
        }
        
        // Initialize autofill
        function initAutofill() {
          detectPasswordFields();
          detectLoginForms();
        }
        
        // Run on page load
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initAutofill);
        } else {
          initAutofill();
        }
        
        // Re-run on dynamic content
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element node
                  if (node.tagName === 'FORM' || node.querySelector('form')) {
                    detectPasswordFields();
                    detectLoginForms();
                  }
                }
              });
            }
          });
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
          const box = document.getElementById('nuru-password-suggestions');
          if (box) {
            box.remove();
          }
        });
      })();
    `;

    try {
      webview.executeJavaScript(script);
      log.info('Autofill script injected successfully');
    } catch (error) {
      log.error('Error injecting autofill script:', error);
    }
  }

  /**
   * Get password suggestions for a domain
   * @param {string} domain - Domain to get suggestions for
   * @returns {Array} - Array of password suggestions
   */
  async getPasswordSuggestions(domain) {
    try {
      this.initPasswordManager();
      
      if (!this.passwordManager.isSetup() || !this.passwordManager.isUnlocked) {
        return [];
      }

      // Get exact domain matches first, then broader matches
      const exactMatches = this.passwordManager.searchPasswords(domain);
      const broaderMatches = this.passwordManager.searchPasswords(domain.split('.')[0]);
      
      // Combine and deduplicate
      const allMatches = [...exactMatches];
      broaderMatches.forEach(match => {
        if (!allMatches.find(existing => existing.id === match.id)) {
          allMatches.push(match);
        }
      });
      
      // Convert to suggestion format with enhanced information
      return allMatches.map(entry => {
        const strength = this.passwordManager.analyzePasswordStrength(entry.password);
        const lastUsed = entry.lastUsed ? new Date(entry.lastUsed) : null;
        const daysSinceUsed = lastUsed ? Math.floor((Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24)) : null;
        
        return {
          id: entry.id,
          title: entry.title,
          username: entry.username,
          password: entry.password,
          domain: entry.domain,
          category: entry.category || 'other',
          strength: strength.strength,
          lastUsed: lastUsed,
          daysSinceUsed: daysSinceUsed,
          isRecent: daysSinceUsed !== null && daysSinceUsed <= 7,
          isExactMatch: entry.domain === domain
        };
      }).sort((a, b) => {
        // Sort by exact match first, then by last used date, then by strength
        if (a.isExactMatch && !b.isExactMatch) return -1;
        if (!a.isExactMatch && b.isExactMatch) return 1;
        
        if (a.lastUsed && b.lastUsed) {
          return b.lastUsed - a.lastUsed; // Most recent first
        }
        if (a.lastUsed && !b.lastUsed) return -1;
        if (!a.lastUsed && b.lastUsed) return 1;
        
        // Sort by strength (strong first)
        const strengthOrder = { strong: 3, medium: 2, weak: 1 };
        return strengthOrder[b.strength] - strengthOrder[a.strength];
      });
    } catch (error) {
      log.error('Error getting password suggestions:', error);
      return [];
    }
  }

  /**
   * Save password from form submission
   * @param {Object} entry - Password entry to save
   * @returns {boolean} - Success status
   */
  async savePasswordFromForm(entry) {
    try {
      this.initPasswordManager();
      
      if (!this.passwordManager.isSetup() || !this.passwordManager.isUnlocked) {
        return false;
      }

      // Check if password already exists for this domain and username
      const existing = this.passwordManager.searchPasswords(entry.domain)
        .find(p => p.username === entry.username);
      
      if (existing) {
        // Update existing password with new information
        const updatedEntry = {
          ...existing,
          password: entry.password,
          title: entry.title || existing.title,
          category: entry.category || existing.category || 'other',
          notes: entry.notes || existing.notes || '',
          lastUsed: new Date().toISOString(),
          updatedAt: Date.now()
        };
        return await this.passwordManager.savePassword(updatedEntry);
      } else {
        // Create new password entry with enhanced information
        const newEntry = {
          ...entry,
          title: entry.title || entry.domain,
          category: entry.category || 'other',
          notes: entry.notes || '',
          lastUsed: new Date().toISOString(),
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        return await this.passwordManager.savePassword(newEntry);
      }
    } catch (error) {
      log.error('Error saving password from form:', error);
      return false;
    }
  }

  /**
   * Enable or disable autofill
   * @param {boolean} enabled - Whether to enable autofill
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    log.info(`Autofill ${enabled ? 'enabled' : 'disabled'}`);
  }
}

module.exports = AutofillManager;
