/**
 * Development build configuration for electron-builder
 * This configuration preserves development features
 */
const path = require('path');
const baseConfig = require('./package.json').build;

// Set environment variable for development build
process.env.NODE_ENV = 'development';

module.exports = {
  ...baseConfig,
  // Define development specific configurations
  extraMetadata: {
    // Mark as development build
    buildType: 'development'
  },
  beforeBuild: () => {
    console.log('Building development version...');
  }
};
