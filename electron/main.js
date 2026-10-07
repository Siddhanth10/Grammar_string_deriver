const { app, BrowserWindow, shell } = require('electron');

const RENDER_URL = 'https://grammar-string-deriver.onrender.com/';

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    title: 'Grammar String Deriver',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadURL(RENDER_URL);

  // Keep external links in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(RENDER_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});