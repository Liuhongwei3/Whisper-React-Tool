type HelpDialogProps = {
  open: boolean
  onClose: () => void
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  if (!open) return null

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-10 flex items-center justify-center bg-slate-950/60 p-4"
      onMouseDown={onClose}
      role="dialog"
    >
      <section
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">使用说明与前置条件</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">首次使用前请确认以下环境已准备好。</p>
          </div>
          <button className="secondary-button" onClick={onClose} type="button">
            关闭
          </button>
        </div>
        <div className="mt-5 space-y-5 text-sm leading-6 text-slate-700 dark:text-slate-300">
          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white">需要安装</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <code>whisper-cli</code>：必须已加入系统 PATH。
              </li>
              <li>
                <code>ffmpeg</code>（含 <code>ffprobe</code>）：处理 MP4、读取时长、按时间范围裁剪时需要，必须已加入系统 PATH。
              </li>
              <li>
                Whisper 模型文件，例如 <code>ggml-large-v3-turbo.bin</code>。
              </li>
            </ul>
            <p className="mt-2">
              可在命令提示符中执行 <code>whisper-cli</code> 与 <code>ffmpeg -version</code> 验证安装。
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white">处理流程</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>选择 WAV 或 MP4、模型、语言和线程数。</li>
              <li>
                可在「识别时间范围」中拖拽两端滑块选择片段，默认全部；字幕时间戳会对齐原片时间轴。
              </li>
              <li>WAV 整段会直接交给 Whisper；MP4 或裁剪片段会先由 FFmpeg 转成 16 kHz 单声道 WAV，默认处理后自动删除。</li>
              <li>
                选择“保留 MP4 转换后的 WAV 文件”后，WAV 会保存在原文件目录，后缀为 <code>.whisper.wav</code>。
              </li>
              <li>
                完成后会在原媒体文件所在目录生成同名 <code>.srt</code> 字幕。
              </li>
            </ol>
          </section>
          <section>
            <h3 className="font-semibold text-slate-900 dark:text-white">查看结果</h3>
            <p className="mt-2">
              任务成功后可点击输出路径打开所在文件夹，或启用“生成完成后自动打开文件所在文件夹”。如果失败，请查看下方实时日志与错误提示。
            </p>
          </section>
        </div>
      </section>
    </div>
  )
}
