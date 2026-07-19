import { useEffect, useRef } from 'react'
import type { WhisperStatus } from '../types'

type StatusPanelProps = {
  status: WhisperStatus
  uiError: string | null
  logs: string[]
  isRunning: boolean
  onClearUiError: () => void
  onOpenPath: (filePath: string) => void
}

const statusColor: Record<WhisperStatus['state'], string> = {
  idle: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  running: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  error: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  cancelled: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
}

const statusLabel: Record<WhisperStatus['state'], string> = {
  idle: '等待中',
  running: '处理中',
  success: '已完成',
  error: '出错',
  cancelled: '等待中',
}

export function StatusPanel({
  status,
  uiError,
  logs,
  isRunning,
  onClearUiError,
  onOpenPath,
}: StatusPanelProps) {
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">处理状态</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor[status.state]}`}>
          {statusLabel[status.state]}
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{status.message}</p>
      {uiError && (
        <div
          className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
          role="alert"
        >
          <p>{uiError}</p>
          <button
            aria-label="关闭错误提示"
            className="shrink-0 font-semibold underline underline-offset-2"
            onClick={onClearUiError}
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
          onClick={() => onOpenPath(status.outputPath!)}
          type="button"
        >
          已生成：{status.outputPath}（点击在文件夹中显示）
        </button>
      )}
      {status.convertedWavPath && (
        <button
          className="mt-2 block w-full break-all rounded-lg bg-sky-50 p-3 text-left text-sm text-sky-800 underline decoration-sky-300 underline-offset-2 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-200 dark:decoration-sky-700 dark:hover:bg-sky-900"
          onClick={() => onOpenPath(status.convertedWavPath!)}
          type="button"
        >
          已保留 WAV：{status.convertedWavPath}（点击在文件夹中显示）
        </button>
      )}
      <pre
        className="mt-4 max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-200"
        ref={logRef}
      >
        {logs.length ? logs.join('') : 'whisper-cli 输出将实时显示在这里。'}
      </pre>
    </section>
  )
}
