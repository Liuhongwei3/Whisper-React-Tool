import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import squirrelStartup from 'electron-squirrel-startup'
import type { WhisperRunOptions, WhisperStatus } from './types'

let mainWindow: BrowserWindow | null = null
let activeProcess: ChildProcessWithoutNullStreams | null = null
let taskRunning = false
let cancellationRequested = false

if (squirrelStartup) {
  app.quit()
}

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

function runCommand(command: string, args: string[], cwd: string, reportWhisperProgress = false) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    let process: ChildProcessWithoutNullStreams
    try {
      process = spawn(command, args, { windowsHide: true, cwd })
    } catch (error) {
      reject(error)
      return
    }

    activeProcess = process
    let settled = false
    const forwardOutput = (data: Buffer) => {
      const output = data.toString()
      sendLog(output)
      if (reportWhisperProgress) reportProgress(output)
    }
    process.stdout.on('data', forwardOutput)
    process.stderr.on('data', forwardOutput)
    process.on('error', (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    })
    process.on('close', (code, signal) => {
      if (!settled) {
        settled = true
        resolve({ code, signal })
      }
    })
  })
}

function executableError(executable: string, error: unknown) {
  const details = error instanceof Error ? error.message : String(error)
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ENOENT') {
    return `无法执行 ${executable}。请确认它已安装并加入系统 PATH。`
  }
  return `无法执行 ${executable}：${details}`
}

async function runTranscription(options: WhisperRunOptions) {
  const outputBasePath = path.join(
    path.dirname(options.inputPath),
    path.basename(options.inputPath, path.extname(options.inputPath)),
  )
  const outputPath = `${outputBasePath}.srt`
  let temporaryWavPath: string | null = null
  let convertedWavPath: string | undefined
  let activeExecutable = 'whisper-cli'

  try {
    await rm(outputPath, { force: true })
    if (cancellationRequested) {
      sendStatus({ state: 'cancelled', message: '字幕生成已取消' })
      return
    }
    let transcriptionInputPath = options.inputPath

    if (path.extname(options.inputPath).toLowerCase() === '.mp4') {
      activeExecutable = 'ffmpeg'
      if (options.keepConvertedWav) {
        convertedWavPath = `${outputBasePath}.whisper.wav`
        temporaryWavPath = convertedWavPath
      } else {
        const temporaryDirectory = path.join(app.getPath('temp'), 'whisper-subtitle-tool')
        await mkdir(temporaryDirectory, { recursive: true })
        temporaryWavPath = path.join(temporaryDirectory, `${randomUUID()}.wav`)
      }
      const ffmpegArgs = [
        '-y',
        '-i',
        options.inputPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        temporaryWavPath,
      ]
      sendStatus({ state: 'running', message: '正在将 MP4 转换为兼容的 WAV 音频…' })
      sendLog(`> ffmpeg ${ffmpegArgs.map((arg) => JSON.stringify(arg)).join(' ')}`)
      const conversion = await runCommand('ffmpeg', ffmpegArgs, path.dirname(options.inputPath))
      if (cancellationRequested || conversion.signal) {
        sendStatus({ state: 'cancelled', message: '字幕生成已取消' })
        return
      }
      if (conversion.code !== 0) {
        throw new Error(`FFmpeg 转码失败（退出码：${conversion.code ?? '未知'}）`)
      }
      if (!existsSync(temporaryWavPath)) {
        throw new Error('FFmpeg 未生成 WAV 文件，无法继续识别')
      }
      transcriptionInputPath = temporaryWavPath
    }

    if (cancellationRequested) {
      sendStatus({ state: 'cancelled', message: '字幕生成已取消' })
      return
    }
    activeExecutable = 'whisper-cli'
    const whisperArgs = [
      '-m',
      options.modelPath,
      '-f',
      transcriptionInputPath,
      '-l',
      options.language,
      '--output-srt',
      '-of',
      outputBasePath,
      '--print-progress',
      '-t',
      String(options.threads),
    ]
    sendStatus({ state: 'running', message: '正在启动 whisper-cli…' })
    sendLog(`> whisper-cli ${whisperArgs.map((arg) => JSON.stringify(arg)).join(' ')}`)
    const transcription = await runCommand(
      'whisper-cli',
      whisperArgs,
      path.dirname(options.inputPath),
      true,
    )
    if (cancellationRequested || transcription.signal) {
      sendStatus({ state: 'cancelled', message: '字幕生成已取消' })
      return
    }
    if (transcription.code !== 0) {
      throw new Error(`whisper-cli 执行失败（退出码：${transcription.code ?? '未知'}）`)
    }
    if (!existsSync(outputPath)) {
      throw new Error(`whisper-cli 已结束，但未找到输出字幕文件：${outputPath}`)
    }
    sendStatus({
      state: 'success',
      message: convertedWavPath ? '字幕生成完成，已保留转换后的 WAV 文件' : '字幕生成完成',
      outputPath,
      convertedWavPath,
      progress: 100,
    })
  } catch (error) {
    if (cancellationRequested) {
      sendStatus({ state: 'cancelled', message: '字幕生成已取消' })
    } else if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      sendStatus({ state: 'error', message: executableError(activeExecutable, error) })
    } else {
      const message = error instanceof Error ? error.message : String(error)
      sendStatus({ state: 'error', message })
    }
  } finally {
    if (temporaryWavPath && !convertedWavPath) {
      await rm(temporaryWavPath, { force: true }).catch((error) => {
        sendLog(`临时 WAV 清理失败：${error instanceof Error ? error.message : String(error)}\n`)
      })
    }
    activeProcess = null
    taskRunning = false
    cancellationRequested = false
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 620,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
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
  ipcMain.handle('whisper:open-parent-folder', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath) {
      throw new Error('无效的文件路径')
    }
    const folderPath = path.dirname(filePath)
    if (!existsSync(folderPath)) {
      throw new Error(`文件夹不存在：${folderPath}`)
    }
    const error = await shell.openPath(folderPath)
    if (error) throw new Error(error)
  })

  ipcMain.handle('whisper:start', (_event, options: WhisperRunOptions) => {
    if (taskRunning) {
      throw new Error('已有字幕生成任务正在运行')
    }
    taskRunning = true
    cancellationRequested = false
    void runTranscription(options)
  })

  ipcMain.handle('whisper:cancel', () => {
    if (taskRunning) {
      cancellationRequested = true
      activeProcess?.kill()
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
