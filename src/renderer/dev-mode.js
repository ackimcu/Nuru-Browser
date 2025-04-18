// Development Mode Toggle
document.addEventListener('DOMContentLoaded', () => {
  const devModeToggle = document.getElementById('dev-mode-toggle');
  
  if (devModeToggle) {
    // Check initial state
    window.electronAPI.getSettings().then(settings => {
      if (settings.development_mode) {
        devModeToggle.classList.add('active');
      } else {
        devModeToggle.classList.remove('active');
      }
    }).catch(err => {
      console.error('Failed to get initial development mode state:', err);
    });

    // Toggle development mode
    devModeToggle.addEventListener('click', async () => {
      try {
        const isDevMode = await window.electronAPI.toggleDevelopmentMode();
        
        if (isDevMode) {
          devModeToggle.classList.add('active');
          showNotification('Development Mode Enabled', 'Auto-updates are disabled in development mode.');
        } else {
          devModeToggle.classList.remove('active');
          showNotification('Development Mode Disabled', 'Auto-updates are now enabled.');
        }
      } catch (error) {
        console.error('Failed to toggle development mode:', error);
      }
    });

    // Listen for development mode changes from main process
    window.electronAPI.onDevelopmentModeChanged((isDevMode) => {
      if (isDevMode) {
        devModeToggle.classList.add('active');
      } else {
        devModeToggle.classList.remove('active');
      }
    });
  }
});

// Show notification
function showNotification(title, message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  
  const notificationTitle = document.createElement('div');
  notificationTitle.className = 'notification-title';
  notificationTitle.textContent = title;
  
  const notificationMessage = document.createElement('div');
  notificationMessage.className = 'notification-message';
  notificationMessage.textContent = message;
  
  notification.appendChild(notificationTitle);
  notification.appendChild(notificationMessage);
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Auto dismiss
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}
