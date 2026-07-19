import { app, BrowserWindow } from 'electron'
import squirrelStartup from 'electron-squirrel-startup'
import { registerIpcHandlers } from './main/ipc'
import { createWindow } from './main/window'

if (squirrelStartup) {
  app.quit()
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
