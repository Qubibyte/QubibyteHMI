const { contextBridge, ipcRenderer } = require('electron');

const isRaspberryPi = process.platform === 'linux' &&
  (process.arch === 'arm64' || process.arch === 'arm');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // System information
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),

  // Platform info
  platform: process.platform,
  isRaspberryPi,
  electronVersion: process.versions.electron,
  getOnboardLedState: () => ipcRenderer.invoke('get-onboard-led-state'),
  setOnboardLed: (on) => ipcRenderer.invoke('set-onboard-led', on),
  toggleOnboardLed: () => ipcRenderer.invoke('toggle-onboard-led'),

  // Persistent settings (survives reboot — stored in userData/settings.json)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getSettingsPath: () => ipcRenderer.invoke('get-settings-path'),
  getLocalHttpOrigin: () => ipcRenderer.invoke('get-local-http-origin'),
  setAppTheme: (theme) => ipcRenderer.invoke('set-app-theme', theme),

  // Navigation
  navigate: (pagePath) => ipcRenderer.send('navigate', pagePath),
  goToMenu: () => ipcRenderer.send('go-to-menu'), // Go to main menu (skip startup)

  // Window controls
  toggleFullscreen: (enable) => ipcRenderer.send('toggle-fullscreen', enable),
  quit: () => ipcRenderer.send('quit-app')
});
