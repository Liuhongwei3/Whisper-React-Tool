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
  startSeconds?: number
  endSeconds?: number
}

export type WhisperStatus = {
  state: 'idle' | 'running' | 'success' | 'error' | 'cancelled'
  message: string
  outputPath?: string
  convertedWavPath?: string
  progress?: number
}
