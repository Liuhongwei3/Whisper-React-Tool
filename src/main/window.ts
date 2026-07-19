import { BrowserWindow } from 'electron'
import path from 'node:path'
import { setMainWindow } from './runtime'

export function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 920,
    minWidth: 760,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  setMainWindow(mainWindow)

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    )
  }
}
