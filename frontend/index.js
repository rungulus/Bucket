#!/usr/bin/env node

const { app, BrowserWindow, ipcMain } = require('electron');
const Bucket = require('./bucket.js');
const path = require('path');
const fs = require('fs');

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

    // Set UI state to open
    Bot.setUIState(true);

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
        Bot.setUIState(false);
        mainWindow = null;
    });
}

// Initialize bot
Bot.init().then(() => {
    console.log('Hi Bucket!');
}).catch(error => {
    console.error('Error initializing bot:', error);
});

// IPC handlers for config and channel management
ipcMain.on('request-update', (event) => {
    const data = Bot.emitUpdate();
    event.reply('bot-update', data);
});

ipcMain.on('update-config', async(event, data) => {
    try {
        const { key, value } = data;
        const configPath = path.join(__dirname, 'config.json');
        const configData = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);

        // Update nested property
        const keys = key.split('.');
        let current = config;
        for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;

        // Save updated config
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 4));

        // Reload config in bot
        await Bot.loadConfig();

        console.log(`Updated config: ${key} = ${value}`);
    } catch (error) {
        console.error('Error updating config:', error);
    }
});

ipcMain.on('add-channel', async(event, data) => {
    try {
        const { name, channelId, chance } = data;
        const configPath = path.join(__dirname, 'config.json');
        const configData = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);

        config.randomChannels.push({ name, channelId, chance });

        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 4));
        await Bot.loadConfig();

        console.log(`Added channel: ${name} (${channelId}) with ${chance * 100}% chance`);
    } catch (error) {
        console.error('Error adding channel:', error);
    }
});

ipcMain.on('get-channel', async(event, index) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const configData = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);

        if (config.randomChannels[index]) {
            mainWindow.webContents.send('channel-data', {
                index,
                channel: config.randomChannels[index]
            });
        }
    } catch (error) {
        console.error('Error getting channel:', error);
    }
});

ipcMain.on('update-channel', async(event, data) => {
    try {
        const { index, name, channelId, chance } = data;
        const configPath = path.join(__dirname, 'config.json');
        const configData = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);

        if (config.randomChannels[index]) {
            config.randomChannels[index] = { name, channelId, chance };
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 4));
            await Bot.loadConfig();

            console.log(`Updated channel ${index}: ${name} (${channelId}) with ${chance * 100}% chance`);
        }
    } catch (error) {
        console.error('Error updating channel:', error);
    }
});

ipcMain.on('delete-channel', async(event, index) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const configData = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);

        if (config.randomChannels[index]) {
            const deletedChannel = config.randomChannels.splice(index, 1)[0];
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 4));
            await Bot.loadConfig();

            console.log(`Deleted channel: ${deletedChannel.name} (${deletedChannel.channelId})`);
        }
    } catch (error) {
        console.error('Error deleting channel:', error);
    }
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