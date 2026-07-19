import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import path from 'node:path'
import type { WhisperRunOptions, WhisperStatus } from './types'

let mainWindow: BrowserWindow | null = null
let activeProcess: ChildProcessWithoutNullStreams | null = null

function sendStatus(status: WhisperStatus) {
  mainWindow?.webContents.send('whisper:status', status)
}

function sendLog(line: string) {
  mainWindow?.webContents.send('whisper:log', line)
}

function fileDetails(filePath: string) {
  return {
    name: path.basename(filePath),
    path: filePath,
    extension: path.extname(filePath).toLowerCase(),
  }
}

function modelPreferencesPath() {
  return path.join(app.getPath('userData'), 'preferences.json')
}

async function saveLastModelPath(modelPath: string) {
  const preferencesPath = modelPreferencesPath()
  await mkdir(path.dirname(preferencesPath), { recursive: true })
  await writeFile(preferencesPath, JSON.stringify({ lastModelPath: modelPath }), 'utf8')
}

async function getLastModelPath() {
  try {
    const preferences = JSON.parse(await readFile(modelPreferencesPath(), 'utf8')) as {
      lastModelPath?: unknown
    }
    return typeof preferences.lastModelPath === 'string' && existsSync(preferences.lastModelPath)
      ? preferences.lastModelPath
      : null
  } catch {
    return null
  }
}

function reportProgress(output: string) {
  const match = output.match(/progress\s*(?:=|:)\s*(\d{1,3})\s*%/i)
  if (!match) return
  const progress = Math.min(100, Number(match[1]))
  sendStatus({
    state: 'running',
    message: `正在识别语音：${progress}%`,
    progress,
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    )
  }
}

app.whenReady().then(() => {
  ipcMain.handle('whisper:select-input', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择音频或视频文件',
      properties: ['openFile'],
      filters: [{ name: '媒体文件', extensions: ['wav', 'mp4'] }],
    })
    return result.canceled ? null : fileDetails(result.filePaths[0])
  })

  ipcMain.handle('whisper:select-model', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择 Whisper 模型',
      properties: ['openFile'],
      filters: [{ name: 'Whisper 模型', extensions: ['bin'] }],
    })
    if (result.canceled) return null
    await saveLastModelPath(result.filePaths[0])
    return fileDetails(result.filePaths[0])
  })

  ipcMain.handle('whisper:get-last-model', async () => {
    const modelPath = await getLastModelPath()
    return modelPath ? fileDetails(modelPath) : null
  })

  ipcMain.handle('whisper:cpu-count', () => Math.max(1, cpus().length))

  ipcMain.handle('whisper:start', (_event, options: WhisperRunOptions) => {
    if (activeProcess) {
      throw new Error('已有字幕生成任务正在运行')
    }

    const outputPath = path.join(
      path.dirname(options.inputPath),
      `${path.basename(options.inputPath, path.extname(options.inputPath))}.srt`,
    )
    const args = [
      '-m',
      options.modelPath,
      '-f',
      options.inputPath,
      '-l',
      options.language,
      '--output-srt',
      '--print-progress',
      '-t',
      String(options.threads),
    ]

    sendStatus({ state: 'running', message: '正在启动 whisper-cli…' })
    sendLog(`> whisper-cli ${args.map((arg) => JSON.stringify(arg)).join(' ')}`)

    try {
      activeProcess = spawn('whisper-cli', args, {
        windowsHide: true,
        cwd: path.dirname(options.inputPath),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendStatus({ state: 'error', message: `无法启动 whisper-cli：${message}` })
      activeProcess = null
      return
    }

    activeProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString()
      sendLog(output)
      reportProgress(output)
    })
    activeProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString()
      sendLog(output)
      reportProgress(output)
    })
    activeProcess.on('error', (error) => {
      activeProcess = null
      sendStatus({
        state: 'error',
        message: `无法执行 whisper-cli。请确认它已加入系统 PATH。(${error.message})`,
      })
    })
    activeProcess.on('close', (code, signal) => {
      activeProcess = null
      if (signal) {
        sendStatus({ state: 'cancelled', message: '字幕生成已取消' })
      } else if (code === 0) {
        sendStatus({
          state: 'success',
          message: '字幕生成完成',
          outputPath,
          progress: 100,
        })
      } else {
        sendStatus({
          state: 'error',
          message: `whisper-cli 执行失败（退出码：${code ?? '未知'}）`,
        })
      }
    })
  })

  ipcMain.handle('whisper:cancel', () => {
    if (activeProcess) {
      activeProcess.kill()
    }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
