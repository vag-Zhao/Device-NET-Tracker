"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var electron_1 = require("electron");
var path = require("path");
var mainWindow = null;
var tray = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 800,
        height: 600,
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });
    mainWindow.removeMenu();
    var htmlPath = path.join(__dirname, 'index.html');
    console.log('Loading HTML from:', htmlPath);
    mainWindow.loadFile(htmlPath);
    mainWindow.on('close', function (event) {
        event.preventDefault();
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.hide();
    });
}
function setupIPC() {
    electron_1.ipcMain.on('minimize-window', function () {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.minimize();
    });
    electron_1.ipcMain.on('maximize-window', function () {
        if (mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        }
        else {
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.maximize();
        }
    });
    electron_1.ipcMain.on('hide-window', function () {
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.hide();
    });
}
function createTray() {
    tray = new electron_1.Tray(path.join(__dirname, '../assets/icon.png'));
    var contextMenu = electron_1.Menu.buildFromTemplate([
        { label: '显示', click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.show(); } },
        { label: '隐藏', click: function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.hide(); } },
        { type: 'separator' },
        { label: '退出', click: function () {
                mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.destroy();
                electron_1.app.quit();
            } }
    ]);
    tray.setToolTip('托盘应用');
    tray.setContextMenu(contextMenu);
    tray.on('click', function () {
        (mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.isVisible()) ? mainWindow.hide() : mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.show();
    });
}
electron_1.app.whenReady().then(function () {
    createWindow();
    createTray();
    setupIPC();
    electron_1.app.on('activate', function () {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
