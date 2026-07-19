import type { SelectedFile } from '../types'

type FileCardProps = {
  label: string
  file: SelectedFile | null
  onSelect: () => void
  onReveal: (filePath: string) => void
  accept: string
}

export function FileCard({ label, file, onSelect, onReveal, accept }: FileCardProps) {
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
