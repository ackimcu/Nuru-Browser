/**
 * Production build configuration for electron-builder
 * This configuration removes development features
 */
const path = require('path');
const baseConfig = require('./package.json').build;

// Set environment variable for production build
process.env.NODE_ENV = 'production';

module.exports = {
  ...baseConfig,
  // Define production specific configurations
  extraMetadata: {
    // Mark as production build
    buildType: 'production'
  },
  beforeBuild: () => {
    console.log('Building production version - development features will be disabled');
  },
  // Additional production optimizations
  asar: true,
  compression: 'maximum',
  removePackageScripts: true
};
