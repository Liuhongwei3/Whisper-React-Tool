import { useCallback, useEffect, useMemo, useState } from 'react'
import { DropZone } from './components/DropZone'
import { FileCard } from './components/FileCard'
import { HelpDialog } from './components/HelpDialog'
import { SettingsPanel } from './components/SettingsPanel'
import { StatusPanel } from './components/StatusPanel'
import { TimeRangeSlider } from './components/TimeRangeSlider'
import type { SelectedFile, WhisperStatus } from './types'

const initialStatus: WhisperStatus = {
  state: 'idle',
  message: '请选择媒体文件、Whisper 模型和处理参数。',
}

export default function App() {
  const [inputFile, setInputFile] = useState<SelectedFile | null>(null)
  const [modelFile, setModelFile] = useState<SelectedFile | null>(null)
  const [threads, setThreads] = useState(8)
  const [language, setLanguage] = useState<'zh' | 'en' | 'ja'>('zh')
  const [maxThreads, setMaxThreads] = useState(8)
  const [status, setStatus] = useState<WhisperStatus>(initialStatus)
  const [logs, setLogs] = useState<string[]>([])
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [openFolderWhenDone, setOpenFolderWhenDone] = useState(
    () => localStorage.getItem('open-folder-when-done') === 'true',
  )
  const [keepConvertedWav, setKeepConvertedWav] = useState(false)
  const [uiError, setUiError] = useState<string | null>(null)
  const [mediaDuration, setMediaDuration] = useState<number | null>(null)
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)
  const [durationError, setDurationError] = useState<string | null>(null)
  const isRunning = status.state === 'running'

  const resetTimeRange = useCallback((duration: number) => {
    const max = Math.max(1, Math.floor(duration))
    setMediaDuration(max)
    setRangeStart(0)
    setRangeEnd(max)
    setDurationError(null)
  }, [])

  const loadMediaDuration = useCallback(
    async (filePath: string) => {
      setMediaDuration(null)
      setDurationError(null)
      try {
        const duration = await window.whisper.getMediaDuration(filePath)
        resetTimeRange(duration)
      } catch (error) {
        setMediaDuration(null)
        setRangeStart(0)
        setRangeEnd(0)
        setDurationError(
          error instanceof Error ? error.message : '无法读取媒体时长，将按全部内容识别。',
        )
      }
    },
    [resetTimeRange],
  )

  const openParentFolder = useCallback(async (filePath: string) => {
    try {
      setUiError(null)
      await window.whisper.openParentFolder(filePath)
    } catch (error) {
      setUiError(error instanceof Error ? `无法打开文件夹：${error.message}` : '无法打开文件夹。')
    }
  }, [])

  useEffect(() => {
    void window.whisper
      .getCpuCount()
      .then((count) => {
        setMaxThreads(count)
        setThreads((current) => Math.min(Math.max(1, current), count))
      })
      .catch((error) => {
        setUiError(error instanceof Error ? `无法读取 CPU 线程数：${error.message}` : '无法读取 CPU 线程数。')
      })
    void window.whisper
      .getLastModelFile()
      .then((file) => {
        if (file) setModelFile(file)
      })
      .catch((error) => {
        setUiError(error instanceof Error ? `无法恢复上次的模型：${error.message}` : '无法恢复上次的模型。')
      })

    const removeLogListener = window.whisper.onLog((line) => {
      setLogs((current) => [...current, line].slice(-300))
    })
    const removeStatusListener = window.whisper.onStatus((nextStatus) => {
      setStatus(nextStatus)
      if (nextStatus.state === 'success' && nextStatus.outputPath && openFolderWhenDone) {
        void openParentFolder(nextStatus.outputPath)
      }
    })
    return () => {
      removeLogListener()
      removeStatusListener()
    }
  }, [openFolderWhenDone, openParentFolder])

  const toggleTheme = () => {
    setIsDark((current) => {
      const next = !current
      localStorage.setItem('theme', next ? 'dark' : 'light')
      return next
    })
  }

  const toggleOpenFolderWhenDone = () => {
    setOpenFolderWhenDone((current) => {
      const next = !current
      localStorage.setItem('open-folder-when-done', String(next))
      return next
    })
  }

  const handleDropFile = useCallback((file: File) => {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (extension !== '.wav' && extension !== '.mp4') {
      setStatus({ state: 'error', message: '仅支持 WAV 或 MP4 文件。' })
      return
    }
    const filePath = window.whisper.getPathForFile(file)
    if (!filePath) {
      setStatus({ state: 'error', message: '无法读取拖拽文件的本地路径。' })
      return
    }
    setInputFile({ name: file.name, path: filePath, extension })
    if (extension !== '.mp4') setKeepConvertedWav(false)
    setStatus({ state: 'idle', message: '媒体文件已选择，请继续选择 Whisper 模型。' })
    void loadMediaDuration(filePath)
  }, [loadMediaDuration])

  const canStart = useMemo(
    () => Boolean(inputFile && modelFile && threads >= 1 && !isRunning),
    [inputFile, isRunning, modelFile, threads],
  )

  const selectInput = async () => {
    try {
      const file = await window.whisper.selectInputFile()
      if (file) {
        setInputFile(file)
        if (file.extension !== '.mp4') setKeepConvertedWav(false)
        setUiError(null)
        setStatus({ state: 'idle', message: '媒体文件已选择。' })
        void loadMediaDuration(file.path)
      }
    } catch (error) {
      setUiError(error instanceof Error ? `无法选择媒体文件：${error.message}` : '无法选择媒体文件。')
    }
  }

  const selectModel = async () => {
    try {
      const file = await window.whisper.selectModelFile()
      if (file) {
        setModelFile(file)
        setUiError(null)
        setStatus({ state: 'idle', message: 'Whisper 模型已选择。' })
      }
    } catch (error) {
      setUiError(error instanceof Error ? `无法选择 Whisper 模型：${error.message}` : '无法选择 Whisper 模型。')
    }
  }

  const start = async () => {
    if (!inputFile || !modelFile) return
    setLogs([])
    setUiError(null)
    const isPartial =
      mediaDuration !== null && (rangeStart > 0 || rangeEnd < mediaDuration)
    try {
      await window.whisper.startTranscription({
        inputPath: inputFile.path,
        modelPath: modelFile.path,
        language,
        threads,
        keepConvertedWav,
        ...(isPartial
          ? {
              startSeconds: rangeStart,
              ...(rangeEnd < (mediaDuration ?? rangeEnd) ? { endSeconds: rangeEnd } : {}),
            }
          : {}),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法启动字幕生成任务。'
      setUiError(`无法启动字幕生成任务：${message}`)
      setStatus({
        state: 'error',
        message,
      })
    }
  }

  return (
    <main
      className={`min-h-screen bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 ${isDark ? 'dark' : ''}`}
    >
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold tracking-wide text-indigo-600">WHISPER CLI GUI</p>
            <h1 className="text-3xl font-bold tracking-tight">Whisper 字幕生成器</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">选择媒体文件和模型，生成中文 SRT 字幕。</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              className="text-sm font-medium text-indigo-700 underline underline-offset-4 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-100"
              onClick={() => setIsHelpOpen(true)}
              type="button"
            >
              使用说明
            </button>
            <button className="secondary-button" onClick={toggleTheme} type="button">
              {isDark ? '切换浅色' : '切换深色'}
            </button>
          </div>
        </header>

        <DropZone onDropFile={handleDropFile} />

        <div className="grid gap-5 md:grid-cols-2">
          <FileCard
            accept="WAV、MP4"
            file={inputFile}
            label="输入媒体文件"
            onReveal={(filePath) => void openParentFolder(filePath)}
            onSelect={() => void selectInput()}
          />
          <FileCard
            accept=".bin"
            file={modelFile}
            label="Whisper 模型"
            onReveal={(filePath) => void openParentFolder(filePath)}
            onSelect={() => void selectModel()}
          />
        </div>

        {inputFile && mediaDuration !== null && (
          <TimeRangeSlider
            disabled={isRunning}
            duration={mediaDuration}
            end={rangeEnd}
            onChange={(startSeconds, endSeconds) => {
              setRangeStart(startSeconds)
              setRangeEnd(endSeconds)
            }}
            onReset={() => resetTimeRange(mediaDuration)}
            start={rangeStart}
          />
        )}
        {inputFile && durationError && (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{durationError}</p>
        )}

        <SettingsPanel
          canStart={canStart}
          isRunning={isRunning}
          keepConvertedWav={keepConvertedWav}
          language={language}
          maxThreads={maxThreads}
          onCancel={() => void window.whisper.cancelTranscription()}
          onKeepConvertedWavChange={setKeepConvertedWav}
          onLanguageChange={setLanguage}
          onStart={() => void start()}
          onThreadsChange={setThreads}
          onToggleOpenFolderWhenDone={toggleOpenFolderWhenDone}
          openFolderWhenDone={openFolderWhenDone}
          showKeepConvertedWav={inputFile?.extension === '.mp4'}
          threads={threads}
        />

        <StatusPanel
          isRunning={isRunning}
          logs={logs}
          onClearUiError={() => setUiError(null)}
          onOpenPath={(filePath) => void openParentFolder(filePath)}
          status={status}
          uiError={uiError}
        />
      </div>

      <HelpDialog onClose={() => setIsHelpOpen(false)} open={isHelpOpen} />
    </main>
  )
}
