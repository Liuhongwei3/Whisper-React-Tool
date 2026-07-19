import { useEffect, useRef } from 'react'

type DropZoneProps = {
  onDropFile: (file: File) => void
}

export function DropZone({ onDropFile }: DropZoneProps) {
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = dropRef.current
    if (!element) return
    const preventDefault = (event: DragEvent) => event.preventDefault()
    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      const file = event.dataTransfer?.files[0]
      if (file) onDropFile(file)
    }
    element.addEventListener('dragover', preventDefault)
    element.addEventListener('drop', onDrop)
    return () => {
      element.removeEventListener('dragover', preventDefault)
      element.removeEventListener('drop', onDrop)
    }
  }, [onDropFile])

  return (
    <div
      className="mb-5 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-5 text-center text-sm text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200"
      ref={dropRef}
    >
      将 WAV 或 MP4 文件拖放到这里，或使用下方按钮选择文件
    </div>
  )
}
