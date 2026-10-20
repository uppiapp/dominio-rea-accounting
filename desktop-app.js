const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let serverProcess = null;

function startLocalServer() {
  try {
    serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      cwd: __dirname,
      env: { ...process.env, PORT: '3000' }
    });

    serverProcess.stdout.on('data', (data) => {
      console.log(`[Server]: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server Error]: ${data}`);
    });
  } catch (err) {
    console.error('Falha ao iniciar servidor embutido:', err);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    title: 'MC Contábil - Sistema Contábil e Fiscal (Local Desktop)',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startLocalServer();
  setTimeout(createMainWindow, 1500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    try { serverProcess.kill(); } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
