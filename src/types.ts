export type SelectedFile = {
  name: string
  path: string
  extension: string
}

export type WhisperRunOptions = {
  inputPath: string
  modelPath: string
  language: 'zh' | 'en' | 'ja'
  threads: number
  keepConvertedWav: boolean
}

export type WhisperStatus = {
  state: 'idle' | 'running' | 'success' | 'error' | 'cancelled'
  message: string
  outputPath?: string
  convertedWavPath?: string
  progress?: number
}

export type WhisperApi = {
  selectInputFile: () => Promise<SelectedFile | null>
  selectModelFile: () => Promise<SelectedFile | null>
  getLastModelFile: () => Promise<SelectedFile | null>
  getPathForFile: (file: File) => string
  openParentFolder: (filePath: string) => Promise<void>
  getCpuCount: () => Promise<number>
  startTranscription: (options: WhisperRunOptions) => Promise<void>
  cancelTranscription: () => Promise<void>
  onLog: (listener: (line: string) => void) => () => void
  onStatus: (listener: (status: WhisperStatus) => void) => () => void
}

declare global {
  interface Window {
    whisper: WhisperApi
  }
}
