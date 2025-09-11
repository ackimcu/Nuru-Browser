/**
 * Nuru Browser Password Manager
 * A secure, minimal password management system
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const log = require('electron-log');

class PasswordManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.passwordsPath = path.join(userDataPath, 'passwords.json');
    this.masterPasswordHash = null;
    this.passwords = new Map();
    this.isUnlocked = false;
    
    this.loadPasswords();
  }

  /**
   * Set or verify master password
   * @param {string} password - Master password
   * @param {boolean} isNew - Whether this is a new master password
   * @returns {boolean} - Success status
   */
  async setMasterPassword(password, isNew = false) {
    try {
      if (isNew) {
        // Create new master password
        this.masterPasswordHash = await this.hashPassword(password);
        this.isUnlocked = true;
        await this.savePasswords();
        log.info('Master password created');
        return true;
      } else {
        // Verify existing master password
        const hash = await this.hashPassword(password);
        if (hash === this.masterPasswordHash) {
          this.isUnlocked = true;
          log.info('Master password verified');
          return true;
        }
        return false;
      }
    } catch (error) {
      log.error('Error with master password:', error);
      return false;
    }
  }

  /**
   * Hash password using PBKDF2
   * @param {string} password - Password to hash
   * @returns {Promise<string>} - Hashed password
   */
  async hashPassword(password) {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(32);
      crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(salt.toString('hex') + ':' + derivedKey.toString('hex'));
      });
    });
  }

  /**
   * Verify password against hash
   * @param {string} password - Password to verify
   * @param {string} hash - Stored hash
   * @returns {Promise<boolean>} - Verification result
   */
  async verifyPassword(password, hash) {
    return new Promise((resolve, reject) => {
      const [saltHex, keyHex] = hash.split(':');
      const salt = Buffer.from(saltHex, 'hex');
      const key = Buffer.from(keyHex, 'hex');
      
      crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(crypto.timingSafeEqual(key, derivedKey));
      });
    });
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param {string} text - Text to encrypt
   * @param {string} password - Encryption password
   * @returns {string} - Encrypted data
   */
  encrypt(text, password) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', password);
    cipher.setAAD(Buffer.from('nuru-browser', 'utf8'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param {string} encryptedData - Encrypted data
   * @param {string} password - Decryption password
   * @returns {string} - Decrypted text
   */
  decrypt(encryptedData, password) {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipher('aes-256-gcm', password);
    decipher.setAAD(Buffer.from('nuru-browser', 'utf8'));
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Generate a strong password
   * @param {Object} options - Password generation options
   * @returns {string} - Generated password
   */
  generatePassword(options = {}) {
    const {
      length = 16,
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSymbols = true,
      excludeSimilar = true
    } = options;

    let charset = '';
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    if (excludeSimilar) {
      charset = charset.replace(/[0O1lI]/g, '');
    }

    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return password;
  }

  /**
   * Analyze password strength
   * @param {string} password - Password to analyze
   * @returns {Object} - Strength analysis
   */
  analyzePasswordStrength(password) {
    let score = 0;
    const feedback = [];

    if (password.length < 8) {
      feedback.push('Use at least 8 characters');
    } else if (password.length >= 12) {
      score += 2;
    } else {
      score += 1;
    }

    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (password.length < 8) feedback.push('Use at least 8 characters');
    if (!/[a-z]/.test(password)) feedback.push('Add lowercase letters');
    if (!/[A-Z]/.test(password)) feedback.push('Add uppercase letters');
    if (!/[0-9]/.test(password)) feedback.push('Add numbers');
    if (!/[^A-Za-z0-9]/.test(password)) feedback.push('Add special characters');

    let strength = 'weak';
    if (score >= 5) strength = 'strong';
    else if (score >= 3) strength = 'medium';

    return { score, strength, feedback };
  }

  /**
   * Save a password entry
   * @param {Object} entry - Password entry
   * @returns {boolean} - Success status
   */
  async savePassword(entry) {
    if (!this.isUnlocked) {
      throw new Error('Password manager is locked');
    }

    try {
      const encryptedPassword = this.encrypt(entry.password, this.masterPasswordHash);
      const strength = this.analyzePasswordStrength(entry.password);
      const passwordEntry = {
        id: entry.id || crypto.randomUUID(),
        domain: entry.domain,
        username: entry.username,
        password: encryptedPassword,
        title: entry.title || entry.domain,
        category: entry.category || 'other',
        notes: entry.notes || '',
        lastUsed: entry.lastUsed || null,
        strength: strength.strength, // Store strength for display
        createdAt: entry.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      this.passwords.set(passwordEntry.id, passwordEntry);
      await this.savePasswords();
      log.info(`Password saved for ${entry.domain}`);
      return true;
    } catch (error) {
      log.error('Error saving password:', error);
      return false;
    }
  }

  /**
   * Get password entry by ID
   * @param {string} id - Entry ID
   * @returns {Object|null} - Password entry or null
   */
  getPassword(id) {
    if (!this.isUnlocked) {
      throw new Error('Password manager is locked');
    }

    const entry = this.passwords.get(id);
    if (!entry) return null;

    try {
      return {
        ...entry,
        password: this.decrypt(entry.password, this.masterPasswordHash)
      };
    } catch (error) {
      log.error('Error decrypting password:', error);
      return null;
    }
  }

  /**
   * Get all password entries
   * @returns {Array} - Array of password entries
   */
  getAllPasswords() {
    if (!this.isUnlocked) {
      throw new Error('Password manager is locked');
    }

    return Array.from(this.passwords.values()).map(entry => ({
      ...entry,
      password: '••••••••' // Masked for display
    }));
  }

  /**
   * Search passwords by domain, title, username, or notes
   * @param {string} query - Search query
   * @returns {Array} - Matching entries
   */
  searchPasswords(query) {
    if (!this.isUnlocked) {
      throw new Error('Password manager is locked');
    }

    const results = [];
    const searchTerm = query.toLowerCase();

    for (const entry of this.passwords.values()) {
      if (
        entry.domain.toLowerCase().includes(searchTerm) ||
        entry.title.toLowerCase().includes(searchTerm) ||
        entry.username.toLowerCase().includes(searchTerm) ||
        (entry.notes && entry.notes.toLowerCase().includes(searchTerm)) ||
        (entry.category && entry.category.toLowerCase().includes(searchTerm))
      ) {
        results.push({
          ...entry,
          password: '••••••••' // Masked for display
        });
      }
    }

    return results.sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Get passwords by category
   * @param {string} category - Category to filter by
   * @returns {Array} - Matching entries
   */
  getPasswordsByCategory(category) {
    if (!this.isUnlocked) {
      throw new Error('Password manager is locked');
    }

    const results = [];
    for (const entry of this.passwords.values()) {
      if (entry.category === category) {
        results.push({
          ...entry,
          password: '••••••••' // Masked for display
        });
      }
    }

    return results.sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Get password statistics
   * @returns {Object} - Password statistics
   */
  getPasswordStats() {
    if (!this.isUnlocked) {
      throw new Error('Password manager is locked');
    }

    const stats = {
      total: this.passwords.size,
      byCategory: {},
      byStrength: { weak: 0, medium: 0, strong: 0 },
      recentlyUsed: 0,
      neverUsed: 0
    };

    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    for (const entry of this.passwords.values()) {
      // Count by category
      const category = entry.category || 'other';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

      // Count by strength (using a simple analysis)
      const strength = this.analyzePasswordStrength(entry.password);
      stats.byStrength[strength.strength]++;

      // Count recently used
      if (entry.lastUsed) {
        const lastUsed = new Date(entry.lastUsed).getTime();
        if (lastUsed > oneWeekAgo) {
          stats.recentlyUsed++;
        }
      } else {
        stats.neverUsed++;
      }
    }

    return stats;
  }

  /**
   * Delete password entry
   * @param {string} id - Entry ID
   * @returns {boolean} - Success status
   */
  async deletePassword(id) {
    if (!this.isUnlocked) {
      throw new Error('Password manager is locked');
    }

    try {
      this.passwords.delete(id);
      await this.savePasswords();
      log.info(`Password deleted: ${id}`);
      return true;
    } catch (error) {
      log.error('Error deleting password:', error);
      return false;
    }
  }

  /**
   * Load passwords from disk
   */
  loadPasswords() {
    try {
      if (fs.existsSync(this.passwordsPath)) {
        const data = fs.readFileSync(this.passwordsPath, 'utf8');
        const parsed = JSON.parse(data);
        
        if (parsed.masterPasswordHash) {
          this.masterPasswordHash = parsed.masterPasswordHash;
        }
        
        if (parsed.passwords) {
          this.passwords = new Map(Object.entries(parsed.passwords));
        }
        
        log.info('Passwords loaded from disk');
      }
    } catch (error) {
      log.error('Error loading passwords:', error);
    }
  }

  /**
   * Save passwords to disk
   */
  async savePasswords() {
    try {
      const data = {
        masterPasswordHash: this.masterPasswordHash,
        passwords: Object.fromEntries(this.passwords),
        version: '1.0.0',
        lastUpdated: Date.now()
      };

      fs.writeFileSync(this.passwordsPath, JSON.stringify(data, null, 2));
      log.info('Passwords saved to disk');
    } catch (error) {
      log.error('Error saving passwords:', error);
    }
  }

  /**
   * Lock the password manager
   */
  lock() {
    this.isUnlocked = false;
    log.info('Password manager locked');
  }

  /**
   * Check if password manager is set up
   * @returns {boolean} - Setup status
   */
  isSetup() {
    return this.masterPasswordHash !== null;
  }

  /**
   * Forget password - reset the entire password manager
   * This will delete all passwords and reset the master password
   * @returns {boolean} - Success status
   */
  async forgetPassword() {
    try {
      log.warn('Password manager reset initiated - this will delete ALL passwords');
      
      // Clear all passwords from memory
      this.passwords.clear();
      
      // Reset master password and unlock state
      this.masterPasswordHash = null;
      this.isUnlocked = false;
      
      // Delete the passwords file if it exists
      if (fs.existsSync(this.passwordsPath)) {
        fs.unlinkSync(this.passwordsPath);
        log.info('Password file deleted successfully');
      }
      
      // Create a backup of the reset action (for audit purposes)
      const resetLog = {
        action: 'password_manager_reset',
        timestamp: new Date().toISOString(),
        reason: 'user_initiated_forget_password'
      };
      
      const resetLogPath = path.join(path.dirname(this.passwordsPath), 'password_reset_log.json');
      try {
        let resetHistory = [];
        if (fs.existsSync(resetLogPath)) {
          const existingData = fs.readFileSync(resetLogPath, 'utf8');
          resetHistory = JSON.parse(existingData);
        }
        resetHistory.push(resetLog);
        fs.writeFileSync(resetLogPath, JSON.stringify(resetHistory, null, 2));
      } catch (logError) {
        log.warn('Could not create reset log:', logError);
      }
      
      log.info('Password manager reset completed successfully - all passwords deleted');
      return true;
    } catch (error) {
      log.error('Error resetting password manager:', error);
      return false;
    }
  }

  /**
   * Export passwords (for backup)
   * @returns {string} - JSON export data
   */
  exportPasswords() {
    if (!this.isUnlocked) {
      throw new Error('Password manager is locked');
    }

    const exportData = {
      version: '1.0.0',
      exportedAt: Date.now(),
      passwords: Array.from(this.passwords.values()).map(entry => ({
        ...entry,
        password: this.decrypt(entry.password, this.masterPasswordHash)
      }))
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import passwords (from backup)
   * @param {string} jsonData - JSON import data
   * @returns {boolean} - Success status
   */
  async importPasswords(jsonData) {
    if (!this.isUnlocked) {
      throw new Error('Password manager is locked');
    }

    try {
      const data = JSON.parse(jsonData);
      if (!data.passwords || !Array.isArray(data.passwords)) {
        throw new Error('Invalid import data');
      }

      for (const entry of data.passwords) {
        const encryptedPassword = this.encrypt(entry.password, this.masterPasswordHash);
        const passwordEntry = {
          id: entry.id || crypto.randomUUID(),
          domain: entry.domain,
          username: entry.username,
          password: encryptedPassword,
          title: entry.title || entry.domain,
          createdAt: entry.createdAt || Date.now(),
          updatedAt: Date.now()
        };

        this.passwords.set(passwordEntry.id, passwordEntry);
      }

      await this.savePasswords();
      log.info(`Imported ${data.passwords.length} passwords`);
      return true;
    } catch (error) {
      log.error('Error importing passwords:', error);
      return false;
    }
  }
}

module.exports = PasswordManager;
