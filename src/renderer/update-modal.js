const { ipcRenderer } = require('electron');

ipcRenderer.on('update-status', (event, status) => {
  document.getElementById('status').innerText = status;
});

ipcRenderer.on('update-done', () => {
  const status = document.getElementById('status');
  status.innerText = 'Update complete! Launching...';
});
