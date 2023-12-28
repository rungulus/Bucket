const { app, BrowserWindow } = require('electron');
const path = require('path');
const Bucket = require('./bucket2.mjs').default;

let mainWindow;
let Bucket = new Bucket();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');

    Bucket.on('update', (data) => {
        mainWindow.webContents.send('bot-update', data);
    });

    Bucket.start(); // Or whatever method starts your bot
}

app.whenReady().then(createWindow);

// Other app event handlers...


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        botProcess.kill(); // Kill the bot process when the app is closed
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
