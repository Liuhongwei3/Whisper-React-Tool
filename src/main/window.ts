import { BrowserWindow } from 'electron'
import path from 'node:path'
import { getBootSplashUrl } from './bootSplash'
import { getMainWindow, setMainWindow } from './runtime'

const WINDOW_WIDTH = 1200
const WINDOW_HEIGHT = 920

let splashWindow: BrowserWindow | null = null
let hasRevealedMainWindow = false

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: '#f1f5f9',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  void splash.loadURL(getBootSplashUrl())
  return splash
}

function loadApp(mainWindow: BrowserWindow) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    return
  }
  void mainWindow.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
  )
}

export function revealMainWindow() {
  if (hasRevealedMainWindow) return
  hasRevealedMainWindow = true

  const mainWindow = getMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (splashWindow && !splashWindow.isDestroyed()) {
    const [x, y] = splashWindow.getPosition()
    const [width, height] = splashWindow.getSize()
    mainWindow.setBounds({ x, y, width, height })
    splashWindow.close()
    splashWindow = null
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  mainWindow.focus()
}

export function createWindow() {
  hasRevealedMainWindow = false

  // 开发模式不需要 splash；打包后先弹出 loading 窗，主窗后台加载
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    splashWindow = createSplashWindow()
  }

  const mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 760,
    minHeight: 620,
    show: Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL),
    backgroundColor: '#f1f5f9',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  setMainWindow(mainWindow)
  loadApp(mainWindow)

  // 防止渲染进程异常时 splash 一直卡住
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    setTimeout(() => revealMainWindow(), 8000)
  }
}
