const { ipcRenderer } = require('electron');

// Function to show update logo and hide spinner
function showUpdateLogo() {
  const spinner = document.getElementById('spinner');
  const updateLogo = document.getElementById('update-logo');
  
  spinner.style.display = 'none';
  updateLogo.style.display = 'block';
}

// Function to show spinner and hide update logo
function showSpinner() {
  const spinner = document.getElementById('spinner');
  const updateLogo = document.getElementById('update-logo');
  
  spinner.style.display = 'block';
  updateLogo.style.display = 'none';
}

// Function to show progress bar
function showProgressBar() {
  const progressContainer = document.getElementById('progress-container');
  progressContainer.style.display = 'block';
}

// Function to hide progress bar
function hideProgressBar() {
  const progressContainer = document.getElementById('progress-container');
  progressContainer.style.display = 'none';
}

ipcRenderer.on('update-status', (event, status, data) => {
  const statusElement = document.getElementById('status');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const versionInfo = document.getElementById('version-info');
  
  if (status === 'available') {
    // Update is available, switch to update logo and show progress bar
    showUpdateLogo();
    showProgressBar();
    statusElement.innerText = 'Updating Nuru Browser';
    versionInfo.textContent = ''; // Hide version info during update
  } else if (status === 'progress' && data) {
    // Handle progress updates - ensure progress bar is visible
    showProgressBar();
    const percent = Math.round(data.percent || 0);
    progressFill.style.width = percent + '%';
    progressText.textContent = percent + '%';
  } else if (status === 'downloaded') {
    // Update is downloaded, show completion
    statusElement.innerText = 'Update complete! Launching...';
    progressFill.style.width = '100%';
    progressText.textContent = '100%';
    versionInfo.textContent = ''; // Hide version info during completion
  } else if (status === 'not-available') {
    // No update available, show normal spinner and hide progress bar
    showSpinner();
    hideProgressBar();
    statusElement.innerText = 'Starting Nuru Browser...';
    versionInfo.textContent = ''; // Hide version info
  } else {
    // Handle other status messages - hide progress bar for normal operations
    hideProgressBar();
    statusElement.innerText = status;
    // Show version info for normal startup messages
    if (status && status.includes('Starting Nuru Browser')) {
      versionInfo.textContent = 'Electron ' + (data?.version || 'Loading...');
    } else {
      versionInfo.textContent = '';
    }
  }
});

ipcRenderer.on('update-done', () => {
  const status = document.getElementById('status');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  
  status.innerText = 'Update complete! Launching...';
  progressFill.style.width = '100%';
  progressText.textContent = '100%';
});

// Listen for download progress events
ipcRenderer.on('update-download-progress', (event, progressInfo) => {
  const percent = Math.round(progressInfo.percent || 0);
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  
  // Ensure update logo and progress bar are shown during download progress
  showUpdateLogo();
  showProgressBar();
  
  progressFill.style.width = percent + '%';
  progressText.textContent = percent + '%';
});

// Initialize with spinner by default and hide progress bar
document.addEventListener('DOMContentLoaded', () => {
  showSpinner();
  hideProgressBar();
});
