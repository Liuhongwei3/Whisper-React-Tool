import { spawn } from 'node:child_process'

export function getMediaDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let process
    try {
      process = spawn(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          filePath,
        ],
        { windowsHide: true },
      )
    } catch (error) {
      reject(error)
      return
    }

    let stdout = ''
    let stderr = ''
    process.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    process.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })
    process.on('error', (error) => {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        reject(new Error('无法执行 ffprobe。请确认已安装 ffmpeg 并加入系统 PATH。'))
        return
      }
      reject(error)
    })
    process.on('close', (code) => {
      const duration = Number.parseFloat(stdout.trim())
      if (code !== 0 || !Number.isFinite(duration) || duration <= 0) {
        reject(new Error(stderr.trim() || '无法读取媒体时长。'))
        return
      }
      resolve(duration)
    })
  })
}
