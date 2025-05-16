#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('Checking latest Electron version...');
const latestVersion = execSync('npm view electron version').toString().trim();
console.log(`Latest Electron version is ${latestVersion}`);

console.log('Installing latest Electron...');
execSync(`npm install --save-dev electron@${latestVersion}`, { stdio: 'inherit' });

console.log('Electron has been updated to', latestVersion);
