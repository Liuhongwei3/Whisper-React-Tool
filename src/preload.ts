import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { WhisperApi, WhisperRunOptions } from './types'

const api: WhisperApi = {
  selectInputFile: () => ipcRenderer.invoke('whisper:select-input'),
  selectModelFile: () => ipcRenderer.invoke('whisper:select-model'),
  getLastModelFile: () => ipcRenderer.invoke('whisper:get-last-model'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openParentFolder: (filePath: string) => ipcRenderer.invoke('whisper:open-parent-folder', filePath),
  getCpuCount: () => ipcRenderer.invoke('whisper:cpu-count'),
  startTranscription: (options: WhisperRunOptions) =>
    ipcRenderer.invoke('whisper:start', options),
  cancelTranscription: () => ipcRenderer.invoke('whisper:cancel'),
  onLog: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, line: string) => listener(line)
    ipcRenderer.on('whisper:log', callback)
    return () => ipcRenderer.removeListener('whisper:log', callback)
  },
  onStatus: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]) =>
      listener(status)
    ipcRenderer.on('whisper:status', callback)
    return () => ipcRenderer.removeListener('whisper:status', callback)
  },
}

contextBridge.exposeInMainWorld('whisper', api)
