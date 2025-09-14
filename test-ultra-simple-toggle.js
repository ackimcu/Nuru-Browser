#!/usr/bin/env node

/**
 * Test script to verify the welcome screen toggle in ultra-simple diagnostics
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Ultra-Simple Diagnostics Welcome Toggle...\n');

// Test 1: Check if the toggle exists in ultra-simple.html
console.log('1. Checking ultra-simple.html structure...');
const ultraSimpleHtml = path.join(__dirname, 'src/renderer/ultra-simple.html');
const htmlContent = fs.readFileSync(ultraSimpleHtml, 'utf8');

const hasWelcomeToggle = htmlContent.includes('welcome-test-mode-toggle');
const hasResetButton = htmlContent.includes('reset-welcome-btn');
const hasDeveloperSection = htmlContent.includes('Developer Tools');
const hasWelcomeScreenSettings = htmlContent.includes('loadWelcomeScreenSettings');
const hasSetWelcomeTestMode = htmlContent.includes('setWelcomeScreenTestMode');
const hasResetWelcomeScreen = htmlContent.includes('resetWelcomeScreen');

console.log(`   ✓ Welcome test mode toggle: ${hasWelcomeToggle ? '✅ Found' : '❌ Missing'}`);
console.log(`   ✓ Reset welcome button: ${hasResetButton ? '✅ Found' : '❌ Missing'}`);
console.log(`   ✓ Developer Tools section: ${hasDeveloperSection ? '✅ Found' : '❌ Missing'}`);
console.log(`   ✓ Load welcome settings function: ${hasWelcomeScreenSettings ? '✅ Found' : '❌ Missing'}`);
console.log(`   ✓ Set welcome test mode function: ${hasSetWelcomeTestMode ? '✅ Found' : '❌ Missing'}`);
console.log(`   ✓ Reset welcome screen function: ${hasResetWelcomeScreen ? '✅ Found' : '❌ Missing'}`);

// Test 2: Check if simple-preload.js has the API methods
console.log('\n2. Checking simple-preload.js API methods...');
const simplePreloadJs = path.join(__dirname, 'src/simple-preload.js');
const preloadContent = fs.readFileSync(simplePreloadJs, 'utf8');

const hasGetWelcomeSettings = preloadContent.includes('getWelcomeScreenSettings');
const hasSetWelcomeTestModePreload = preloadContent.includes('setWelcomeScreenTestMode');
const hasResetWelcomeScreenPreload = preloadContent.includes('resetWelcomeScreen');

console.log(`   ✓ Get welcome settings API: ${hasGetWelcomeSettings ? '✅ Found' : '❌ Missing'}`);
console.log(`   ✓ Set welcome test mode API: ${hasSetWelcomeTestModePreload ? '✅ Found' : '❌ Missing'}`);
console.log(`   ✓ Reset welcome screen API: ${hasResetWelcomeScreenPreload ? '✅ Found' : '❌ Missing'}`);

// Test 3: Check if main process has the IPC handlers
console.log('\n3. Checking main process IPC handlers...');
const mainJs = path.join(__dirname, 'src/main.js');
const mainContent = fs.readFileSync(mainJs, 'utf8');

const hasSetSettingHandler = mainContent.includes('set-setting');
const hasResetWelcomePageHandler = mainContent.includes('reset-welcome-page');

console.log(`   ✓ Set setting IPC handler: ${hasSetSettingHandler ? '✅ Found' : '❌ Missing'}`);
console.log(`   ✓ Reset welcome page IPC handler: ${hasResetWelcomePageHandler ? '✅ Found' : '❌ Missing'}`);

// Summary
console.log('\n📊 Summary:');
const allTests = [
  hasWelcomeToggle, hasResetButton, hasDeveloperSection,
  hasWelcomeScreenSettings, hasSetWelcomeTestMode, hasResetWelcomeScreen,
  hasGetWelcomeSettings, hasSetWelcomeTestModePreload, hasResetWelcomeScreenPreload,
  hasSetSettingHandler, hasResetWelcomePageHandler
];

const passedTests = allTests.filter(test => test).length;
const totalTests = allTests.length;

console.log(`   Tests passed: ${passedTests}/${totalTests}`);
console.log(`   Status: ${passedTests === totalTests ? '✅ All tests passed!' : '❌ Some tests failed'}`);

if (passedTests === totalTests) {
  console.log('\n🎉 Welcome screen test mode toggle has been successfully added to ultra-simple diagnostics!');
  console.log('   The toggle should now appear in the diagnostics window under "Developer Tools"');
  console.log('   Open the browser and click "Open Diagnostics" to see it!');
} else {
  console.log('\n⚠️  Some components are missing. Please check the implementation.');
}
