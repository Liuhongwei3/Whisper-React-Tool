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
  accept,
}: {
  label: string
  file: SelectedFile | null
  onSelect: () => void
  accept: string
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-semibold text-slate-900">{label}</h2>
        <button className="secondary-button" onClick={onSelect} type="button">
          选择文件
        </button>
      </div>
      {file ? (
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <p className="font-medium text-slate-800">{file.name}</p>
          <p className="mt-1 break-all text-slate-500">{file.path}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-indigo-600">
            {file.extension.slice(1)} 文件
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">支持 {accept}</p>
      )}
    </section>
  )
}

export default function App() {
  const [inputFile, setInputFile] = useState<SelectedFile | null>(null)
  const [modelFile, setModelFile] = useState<SelectedFile | null>(null)
  const [threads, setThreads] = useState(8)
  const [maxThreads, setMaxThreads] = useState(8)
  const [status, setStatus] = useState<WhisperStatus>(initialStatus)
  const [logs, setLogs] = useState<string[]>([])
  const dropRef = useRef<HTMLDivElement>(null)
  const isRunning = status.state === 'running'

  useEffect(() => {
    void window.whisper.getCpuCount().then((count) => {
      setMaxThreads(count)
      setThreads((current) => Math.min(Math.max(1, current), count))
    })

    const removeLogListener = window.whisper.onLog((line) => {
      setLogs((current) => [...current, line].slice(-300))
    })
    const removeStatusListener = window.whisper.onStatus(setStatus)
    return () => {
      removeLogListener()
      removeStatusListener()
    }
  }, [])

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
    const file = await window.whisper.selectInputFile()
    if (file) {
      setInputFile(file)
      setStatus({ state: 'idle', message: '媒体文件已选择。' })
    }
  }

  const selectModel = async () => {
    const file = await window.whisper.selectModelFile()
    if (file) {
      setModelFile(file)
      setStatus({ state: 'idle', message: 'Whisper 模型已选择。' })
    }
  }

  const start = async () => {
    if (!inputFile || !modelFile) return
    setLogs([])
    try {
      await window.whisper.startTranscription({
        inputPath: inputFile.path,
        modelPath: modelFile.path,
        language: 'zh',
        threads,
      })
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : '无法启动字幕生成任务。',
      })
    }
  }

  const statusColor = {
    idle: 'bg-slate-100 text-slate-700',
    running: 'bg-amber-100 text-amber-800',
    success: 'bg-emerald-100 text-emerald-800',
    error: 'bg-rose-100 text-rose-800',
    cancelled: 'bg-slate-200 text-slate-700',
  }[status.state]

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <header className="mb-8">
          <p className="mb-2 text-sm font-semibold tracking-wide text-indigo-600">WHISPER CLI GUI</p>
          <h1 className="text-3xl font-bold tracking-tight">Whisper 字幕生成器</h1>
          <p className="mt-2 text-slate-600">选择媒体文件和模型，生成中文 SRT 字幕。</p>
        </header>

        <div
          className="mb-5 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-5 text-center text-sm text-indigo-800"
          ref={dropRef}
        >
          将 WAV 或 MP4 文件拖放到这里，或使用下方按钮选择文件
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <FileCard label="输入媒体文件" file={inputFile} onSelect={() => void selectInput()} accept="WAV、MP4" />
          <FileCard label="Whisper 模型" file={modelFile} onSelect={() => void selectModel()} accept=".bin" />
        </div>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">生成设置</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              语言
              <select className="field mt-2" disabled value="zh">
                <option value="zh">中文（Chinese）</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
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
            <div className="text-sm font-medium text-slate-700">
              输出格式
              <label className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 font-normal text-slate-800">
                <input checked readOnly type="checkbox" />
                SRT
              </label>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="primary-button" disabled={!canStart} onClick={() => void start()} type="button">
              {isRunning ? '正在生成字幕…' : '开始生成字幕'}
            </button>
            {isRunning && (
              <button className="secondary-button" onClick={() => void window.whisper.cancelTranscription()} type="button">
                取消任务
              </button>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">处理状态</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>
              {status.state === 'running' ? '处理中' : status.state === 'success' ? '已完成' : status.state === 'error' ? '出错' : '等待中'}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-700">{status.message}</p>
          {status.outputPath && (
            <p className="mt-2 break-all rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              已生成：{status.outputPath}
            </p>
          )}
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-200">
            {logs.length ? logs.join('') : 'whisper-cli 输出将实时显示在这里。'}
          </pre>
        </section>
      </div>
    </main>
  )
}
