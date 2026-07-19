import { useEffect, useMemo, useRef, useState } from 'react'
import type { SelectedFile, WhisperStatus } from './types'

const initialStatus: WhisperStatus = {
  state: 'idle',
  message: '请选择媒体文件、Whisper 模型和处理参数。',
}

function FileCard({
  label,
  file,
  onSelect,
  onReveal,
  accept,
}: {
  label: string
  file: SelectedFile | null
  onSelect: () => void
  onReveal: (filePath: string) => void
  accept: string
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{label}</h2>
        <button className="secondary-button" onClick={onSelect} type="button">
          选择文件
        </button>
      </div>
      {file ? (
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm dark:bg-slate-950">
          <p className="font-medium text-slate-800 dark:text-slate-100">{file.name}</p>
          <button
            className="mt-1 block break-all text-left text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-indigo-600 dark:text-slate-300 dark:decoration-slate-600 dark:hover:text-indigo-300"
            onClick={() => onReveal(file.path)}
            title="在文件夹中显示"
            type="button"
          >
            {file.path}
          </button>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-indigo-600">
            {file.extension.slice(1)} 文件
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">支持 {accept}</p>
      )}
    </section>
  )
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
  const [openFolderWhenDone, setOpenFolderWhenDone] = useState(
    () => localStorage.getItem('open-folder-when-done') === 'true',
  )
  const [uiError, setUiError] = useState<string | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const logRef = useRef<HTMLPreElement>(null)
  const isRunning = status.state === 'running'

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
  }, [openFolderWhenDone])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

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

  const openParentFolder = async (filePath: string) => {
    try {
      setUiError(null)
      await window.whisper.openParentFolder(filePath)
    } catch (error) {
      setUiError(error instanceof Error ? `无法打开文件夹：${error.message}` : '无法打开文件夹。')
    }
  }

  useEffect(() => {
    const element = dropRef.current
    if (!element) return
    const preventDefault = (event: DragEvent) => event.preventDefault()
    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      const file = event.dataTransfer?.files[0]
      if (!file) return
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
      setStatus({ state: 'idle', message: '媒体文件已选择，请继续选择 Whisper 模型。' })
    }
    element.addEventListener('dragover', preventDefault)
    element.addEventListener('drop', onDrop)
    return () => {
      element.removeEventListener('dragover', preventDefault)
      element.removeEventListener('drop', onDrop)
    }
  }, [])

  const canStart = useMemo(
    () => Boolean(inputFile && modelFile && threads >= 1 && !isRunning),
    [inputFile, isRunning, modelFile, threads],
  )

  const selectInput = async () => {
    try {
      const file = await window.whisper.selectInputFile()
      if (file) {
        setInputFile(file)
        setUiError(null)
        setStatus({ state: 'idle', message: '媒体文件已选择。' })
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
    try {
      await window.whisper.startTranscription({
        inputPath: inputFile.path,
        modelPath: modelFile.path,
        language,
        threads,
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

  const statusColor = {
    idle: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    running: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    error: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
    cancelled: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  }[status.state]

  return (
    <main className={`min-h-screen bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 ${isDark ? 'dark' : ''}`}>
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold tracking-wide text-indigo-600">WHISPER CLI GUI</p>
            <h1 className="text-3xl font-bold tracking-tight">Whisper 字幕生成器</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">选择媒体文件和模型，生成中文 SRT 字幕。</p>
          </div>
          <button className="secondary-button" onClick={toggleTheme} type="button">
            {isDark ? '切换浅色' : '切换深色'}
          </button>
        </header>

        <div
          className="mb-5 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-5 text-center text-sm text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200"
          ref={dropRef}
        >
          将 WAV 或 MP4 文件拖放到这里，或使用下方按钮选择文件
        </div>

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

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
          <h2 className="mb-4 font-semibold">生成设置</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              语言
              <select
                className="field mt-2"
                disabled={isRunning}
                onChange={(event) => setLanguage(event.target.value as 'zh' | 'en' | 'ja')}
                value={language}
              >
                <option value="zh">中文（Chinese）</option>
                <option value="en">英文（English）</option>
                <option value="ja">日语（Japanese）</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              线程数 <span className="font-normal text-slate-400">（最多 {maxThreads}）</span>
              <input
                className="field mt-2"
                disabled={isRunning}
                max={maxThreads}
                min={1}
                onChange={(event) => setThreads(Math.max(1, Math.min(maxThreads, Number(event.target.value))))}
                type="number"
                value={threads}
              />
            </label>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              输出格式
              <label className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 font-normal text-slate-800 dark:border-slate-600 dark:text-slate-200">
                <input checked readOnly type="checkbox" />
                SRT
              </label>
            </div>
          </div>
          <label className="mt-5 flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input checked={openFolderWhenDone} onChange={toggleOpenFolderWhenDone} type="checkbox" />
            生成完成后自动打开文件所在文件夹
          </label>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            {isRunning && (
              <button className="secondary-button" onClick={() => void window.whisper.cancelTranscription()} type="button">
                取消任务
              </button>
            )}
            <button className="primary-button" disabled={!canStart} onClick={() => void start()} type="button">
              {isRunning ? '正在生成字幕…' : '开始生成字幕'}
            </button>
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">处理状态</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>
              {status.state === 'running' ? '处理中' : status.state === 'success' ? '已完成' : status.state === 'error' ? '出错' : '等待中'}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{status.message}</p>
          {uiError && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200" role="alert">
              <p>{uiError}</p>
              <button
                aria-label="关闭错误提示"
                className="shrink-0 font-semibold underline underline-offset-2"
                onClick={() => setUiError(null)}
                type="button"
              >
                关闭
              </button>
            </div>
          )}
          {isRunning && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{status.progress === undefined ? '正在准备或处理音频…' : '识别进度'}</span>
                <span>{status.progress === undefined ? '处理中' : `${status.progress}%`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className={`h-full rounded-full bg-indigo-600 transition-all duration-300 ${status.progress === undefined ? 'w-1/3 animate-pulse' : ''}`}
                  style={status.progress === undefined ? undefined : { width: `${status.progress}%` }}
                />
              </div>
            </div>
          )}
          {status.outputPath && (
            <button
              className="mt-2 block w-full break-all rounded-lg bg-emerald-50 p-3 text-left text-sm text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200 dark:decoration-emerald-700 dark:hover:bg-emerald-900"
              onClick={() => void openParentFolder(status.outputPath!)}
              type="button"
            >
              已生成：{status.outputPath}（点击在文件夹中显示）
            </button>
          )}
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-200" ref={logRef}>
            {logs.length ? logs.join('') : 'whisper-cli 输出将实时显示在这里。'}
          </pre>
        </section>
      </div>
    </main>
  )
}
