type TimeRangeSliderProps = {
  duration: number
  start: number
  end: number
  disabled?: boolean
  onChange: (start: number, end: number) => void
  onReset: () => void
}

const MIN_SPAN = 1

function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds + 1e-9))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function TimeRangeSlider({
  duration,
  start,
  end,
  disabled,
  onChange,
  onReset,
}: TimeRangeSliderProps) {
  const max = Math.max(MIN_SPAN, duration)
  const startPct = (start / max) * 100
  const endPct = (end / max) * 100
  const isPartial = start > 0 || end < max - 0.01

  const setStart = (nextStart: number) => {
    const clamped = Math.min(Math.max(0, nextStart), end - MIN_SPAN)
    onChange(clamped, end)
  }

  const setEnd = (nextEnd: number) => {
    const clamped = Math.max(Math.min(max, nextEnd), start + MIN_SPAN)
    onChange(start, clamped)
  }

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">识别时间范围</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            默认全部；拖拽两端滑块选择要生成字幕的片段。
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={disabled || !isPartial}
          onClick={onReset}
          type="button"
        >
          重置为全部
        </button>
      </div>

      <div className="mb-2 flex justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
        <span>开始 {formatClock(start)}</span>
        <span className="text-slate-500 dark:text-slate-400">
          已选 {formatClock(end - start)} / 总长 {formatClock(max)}
        </span>
        <span>结束 {formatClock(end)}</span>
      </div>

      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="absolute h-full rounded-full bg-indigo-500"
            style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
          />
        </div>
        <input
          aria-label="开始时间"
          className="range-thumb absolute inset-0 m-0 h-8 w-full appearance-none bg-transparent"
          disabled={disabled}
          max={max}
          min={0}
          onChange={(event) => setStart(Number(event.target.value))}
          step={1}
          style={{ zIndex: start > max - end ? 5 : 3 }}
          type="range"
          value={start}
        />
        <input
          aria-label="结束时间"
          className="range-thumb absolute inset-0 m-0 h-8 w-full appearance-none bg-transparent"
          disabled={disabled}
          max={max}
          min={0}
          onChange={(event) => setEnd(Number(event.target.value))}
          step={1}
          style={{ zIndex: start > max - end ? 4 : 5 }}
          type="range"
          value={end}
        />
      </div>
    </section>
  )
}
