#!/usr/bin/env node

const { app, BrowserWindow, ipcMain } = require('electron');
const Bucket = require('./bucket.js');

console.log('Hello, Electron!');
const Bot = new Bucket();

let mainWindow;
let updateInterval;
let messagesInterval;

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

    // Set up intervals for updates
    updateInterval = setInterval(() => {
        if (!mainWindow.isDestroyed()) {
            const data = Bot.emitUpdate();
            mainWindow.webContents.send('bot-update', data);
        }
    }, 1000);

    messagesInterval = setInterval(() => {
        if (!mainWindow.isDestroyed()) {
            const recentMessages = Bot.getRecentMessages();
            mainWindow.webContents.send('recent-messages-update', recentMessages);
        }
    }, 1000);

    // setInterval(() => {
    //     const recentMessages = Bot.emitStatus();
    //     mainWindow.webContents.send('bot-status', recentMessages);
    // }, 1000);

    Bot.on('update', (data) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('bot-update', data);
        }
    });
    Bot.on('error', (errorMessage) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('error-message', errorMessage);
        }
    });

    // Handle window close
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Initialize bot
Bot.init().then(() => {
    console.log('Hi Bucket!');
}).catch(error => {
    console.error('Error initializing bot:', error);
});

app.whenReady().then(createWindow);

// Handle window close
app.on('window-all-closed', async() => {
    // Clear intervals
    if (updateInterval) clearInterval(updateInterval);
    if (messagesInterval) clearInterval(messagesInterval);

    // Stop the bot
    if (Bot) {
        try {
            await Bot.stop();
        } catch (error) {
            console.error('Error stopping bot:', error);
        }
    }

    // Quit the app
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle app activation
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Clean up on app quit
app.on('before-quit', async() => {
    // Clear intervals
    if (updateInterval) clearInterval(updateInterval);
    if (messagesInterval) clearInterval(messagesInterval);

    // Stop the bot
    if (Bot) {
        try {
            await Bot.stop();
        } catch (error) {
            console.error('Error stopping bot:', error);
        }
    }
});