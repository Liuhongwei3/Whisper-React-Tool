type SettingsPanelProps = {
  language: 'zh' | 'en' | 'ja'
  threads: number
  maxThreads: number
  isRunning: boolean
  canStart: boolean
  openFolderWhenDone: boolean
  keepConvertedWav: boolean
  showKeepConvertedWav: boolean
  onLanguageChange: (language: 'zh' | 'en' | 'ja') => void
  onThreadsChange: (threads: number) => void
  onToggleOpenFolderWhenDone: () => void
  onKeepConvertedWavChange: (keep: boolean) => void
  onCancel: () => void
  onStart: () => void
}

export function SettingsPanel({
  language,
  threads,
  maxThreads,
  isRunning,
  canStart,
  openFolderWhenDone,
  keepConvertedWav,
  showKeepConvertedWav,
  onLanguageChange,
  onThreadsChange,
  onToggleOpenFolderWhenDone,
  onKeepConvertedWavChange,
  onCancel,
  onStart,
}: SettingsPanelProps) {
  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
      <h2 className="mb-4 font-semibold">生成设置</h2>
      <div className="grid gap-5 sm:grid-cols-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          语言
          <select
            className="field mt-2"
            disabled={isRunning}
            onChange={(event) => onLanguageChange(event.target.value as 'zh' | 'en' | 'ja')}
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
            onChange={(event) => onThreadsChange(Math.max(1, Math.min(maxThreads, Number(event.target.value))))}
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
        <input checked={openFolderWhenDone} onChange={onToggleOpenFolderWhenDone} type="checkbox" />
        生成完成后自动打开文件所在文件夹
      </label>
      {showKeepConvertedWav && (
        <label className="mt-3 flex w-fit cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            checked={keepConvertedWav}
            className="mt-1"
            disabled={isRunning}
            onChange={(event) => onKeepConvertedWavChange(event.target.checked)}
            type="checkbox"
          />
          <span>
            保留 MP4 转换后的 WAV 文件
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              将保存到媒体文件所在目录，文件名后缀为 <code>.whisper.wav</code>。
            </span>
          </span>
        </label>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {isRunning && (
          <button className="secondary-button" onClick={onCancel} type="button">
            取消任务
          </button>
        )}
        <button className="primary-button" disabled={!canStart} onClick={onStart} type="button">
          {isRunning ? '正在生成字幕…' : '开始生成字幕'}
        </button>
      </div>
    </section>
  )
}
