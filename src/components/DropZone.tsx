import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect } from 'react'

type DropZoneProps = {
  onDropPath: (filePath: string) => void
}

export function DropZone({ onDropPath }: DropZoneProps) {
  useEffect(() => {
    let removeDropListener: (() => void) | undefined
    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'drop' && event.payload.paths[0]) {
          onDropPath(event.payload.paths[0])
        }
      })
      .then((removeListener) => {
        removeDropListener = removeListener
      })
    return () => {
      removeDropListener?.()
    }
  }, [onDropPath])

  return (
    <div className="mb-5 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-5 text-center text-sm text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
      将 WAV 或 MP4 文件拖放到这里，或使用下方按钮选择文件
    </div>
  )
}
