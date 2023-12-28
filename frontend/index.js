const { app, BrowserWindow } = require('electron');
const Bucket = require('./bucket.js');
console.log('Hello, Electron!');
const Bot = new Bucket();
Bot.initialize().then(() => {
    console.log('Hi Bucket!');
}).catch(error => {
    console.error('Error initializing bot:', error);
});

let mainWindow;

function createWindow() {
    console.log('trying window');
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (Bot) Bot.stop();
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});