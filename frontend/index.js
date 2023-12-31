const { app, BrowserWindow, ipcMain } = require('electron');
const Bucket = require('./bucket.js');

console.log('Hello, Electron!');
const Bot = new Bucket();

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1250,
        height: 900,
        minWidth: 1250,
        minHeight: 900,
        title: "Bucket",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: __dirname + `/css/bucket.png`,
        autoHideMenuBar: true
    });

    mainWindow.loadFile('index.html');
    setInterval(() => {
        const data = Bot.emitUpdate();
        mainWindow.webContents.send('bot-update', data);
    }, 1000);
    setInterval(() => {
        const recentMessages = Bot.getRecentMessages();
        mainWindow.webContents.send('recent-messages-update', recentMessages);
    }, 1000);

    // setInterval(() => {
    //     const recentMessages = Bot.emitStatus();
    //     mainWindow.webContents.send('bot-status', recentMessages);
    // }, 1000);

    Bot.on('update', (data) => {
        mainWindow.webContents.send('bot-update', data);
    });
    Bot.on('error', (errorMessage) => {
        mainWindow.webContents.send('error-message', errorMessage);
    });
}

Bot.initialize().then(() => {
    console.log('Hi Bucket!');
}).catch(error => {
    console.error('Error initializing bot:', error);
});

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
