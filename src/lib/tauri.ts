import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ask, open } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import type { SelectedFile, WhisperRunOptions, WhisperStatus } from '../types'

async function selectedFileFromPath(filePath: string): Promise<SelectedFile> {
  return invoke<SelectedFile>('get_file_details', { filePath })
}

async function selectFile(filters: { name: string; extensions: string[] }[]) {
  const selectedPath = await open({
    directory: false,
    filters,
    multiple: false,
  })
  return typeof selectedPath === 'string' ? selectedPath : null
}

function subscribe<T>(event: string, listener: (payload: T) => void) {
  let isActive = true
  let unlisten: (() => void) | undefined

  void listen<T>(event, ({ payload }) => listener(payload)).then((removeListener) => {
    if (isActive) {
      unlisten = removeListener
    } else {
      removeListener()
    }
  })

  return () => {
    isActive = false
    unlisten?.()
  }
}

export const whisper = {
  async selectInputFile() {
    const selectedPath = await selectFile([{ name: '媒体文件', extensions: ['wav', 'mp4'] }])
    return selectedPath ? selectedFileFromPath(selectedPath) : null
  },
  async selectModelFile() {
    const selectedPath = await selectFile([{ name: 'Whisper 模型', extensions: ['bin'] }])
    if (!selectedPath) return null
    await invoke('save_last_model', { modelPath: selectedPath })
    return selectedFileFromPath(selectedPath)
  },
  getFileDetails: selectedFileFromPath,
  getLastModelFile: () => invoke<SelectedFile | null>('get_last_model'),
  openParentFolder: (filePath: string) => revealItemInDir(filePath),
  getCpuCount: () => invoke<number>('get_cpu_count'),
  getMediaDuration: (filePath: string) =>
    invoke<number>('get_media_duration', { filePath }),
  startTranscription: (options: WhisperRunOptions) =>
    invoke<void>('start_transcription', { options }),
  cancelTranscription: () => invoke<void>('cancel_transcription'),
  isTaskRunning: () => invoke<boolean>('is_task_running'),
  confirmCancelOnClose: () =>
    ask('字幕生成正在进行中。关闭窗口将取消当前任务，确定要退出吗？', {
      cancelLabel: '继续生成',
      kind: 'warning',
      okLabel: '退出并取消任务',
      title: '任务进行中',
    }),
  onLog: (listener: (line: string) => void) => subscribe<string>('whisper:log', listener),
  onStatus: (listener: (status: WhisperStatus) => void) =>
    subscribe<WhisperStatus>('whisper:status', listener),
}
