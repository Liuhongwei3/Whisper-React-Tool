import { dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { cpus } from 'node:os'
import path from 'node:path'
import type { WhisperRunOptions } from '../types'
import { getLastModelPath, saveLastModelPath } from './preferences'
import { getMainWindow, isTaskRunning, setCancellationRequested, setTaskRunning } from './runtime'
import { cancelTranscription, runTranscription } from './transcription'

function fileDetails(filePath: string) {
  return {
    name: path.basename(filePath),
    path: filePath,
    extension: path.extname(filePath).toLowerCase(),
  }
}

export function registerIpcHandlers() {
  ipcMain.handle('whisper:select-input', async () => {
    const result = await dialog.showOpenDialog(getMainWindow()!, {
      title: '选择音频或视频文件',
      properties: ['openFile'],
      filters: [{ name: '媒体文件', extensions: ['wav', 'mp4'] }],
    })
    return result.canceled ? null : fileDetails(result.filePaths[0])
  })

  ipcMain.handle('whisper:select-model', async () => {
    const result = await dialog.showOpenDialog(getMainWindow()!, {
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
    if (isTaskRunning()) {
      throw new Error('已有字幕生成任务正在运行')
    }
    setTaskRunning(true)
    setCancellationRequested(false)
    void runTranscription(options)
  })

  ipcMain.handle('whisper:cancel', () => {
    cancelTranscription()
  })
}
