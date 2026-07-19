import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import type { WhisperRunOptions } from '../types'
import {
  getActiveProcess,
  isCancellationRequested,
  isTaskRunning,
  sendLog,
  sendStatus,
  setActiveProcess,
  setCancellationRequested,
  setTaskRunning,
} from './runtime'
import { shiftSrtTimestamps } from './srt'

function reportProgress(output: string) {
  const match = output.match(/progress\s*(?:=|:)\s*(\d{1,3})\s*%/i)
  if (!match) return
  const progress = Math.min(100, Number(match[1]))
  sendStatus({
    state: 'running',
    message: `正在识别语音：${progress}%`,
    progress,
  })
}

function runCommand(command: string, args: string[], cwd: string, reportWhisperProgress = false) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    let process: ChildProcessWithoutNullStreams
    try {
      process = spawn(command, args, { windowsHide: true, cwd })
    } catch (error) {
      reject(error)
      return
    }

    setActiveProcess(process)
    let settled = false
    const forwardOutput = (data: Buffer) => {
      const output = data.toString()
      sendLog(output)
      if (reportWhisperProgress) reportProgress(output)
    }
    process.stdout.on('data', forwardOutput)
    process.stderr.on('data', forwardOutput)
    process.on('error', (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    })
    process.on('close', (code, signal) => {
      if (!settled) {
        settled = true
        resolve({ code, signal })
      }
    })
  })
}

function executableError(executable: string, error: unknown) {
  const details = error instanceof Error ? error.message : String(error)
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ENOENT') {
    return `无法执行 ${executable}。请确认它已安装并加入系统 PATH。`
  }
  return `无法执行 ${executable}：${details}`
}

function resolveTimeWindow(options: WhisperRunOptions) {
  const startSeconds = Math.max(0, options.startSeconds ?? 0)
  const durationSeconds =
    options.endSeconds === undefined
      ? undefined
      : Math.max(0, Math.max(startSeconds, options.endSeconds) - startSeconds)
  // Only trim when the UI explicitly provided a window (omitted = full media).
  const isPartial = options.startSeconds !== undefined || options.endSeconds !== undefined
  return { startSeconds, durationSeconds, isPartial }
}

export async function runTranscription(options: WhisperRunOptions) {
  const outputBasePath = path.join(
    path.dirname(options.inputPath),
    path.basename(options.inputPath, path.extname(options.inputPath)),
  )
  const outputPath = `${outputBasePath}.srt`
  let temporaryWavPath: string | null = null
  let convertedWavPath: string | undefined
  let activeExecutable = 'whisper-cli'
  const { startSeconds, durationSeconds, isPartial } = resolveTimeWindow(options)
  const extension = path.extname(options.inputPath).toLowerCase()
  const needsFfmpeg = extension === '.mp4' || isPartial

  try {
    await rm(outputPath, { force: true })
    if (isCancellationRequested()) {
      sendStatus({ state: 'cancelled', message: '字幕生成已取消' })
      return
    }
    let transcriptionInputPath = options.inputPath

    if (needsFfmpeg) {
      activeExecutable = 'ffmpeg'
      if (extension === '.mp4' && options.keepConvertedWav) {
        convertedWavPath = `${outputBasePath}.whisper.wav`
        temporaryWavPath = convertedWavPath
      } else {
        const temporaryDirectory = path.join(app.getPath('temp'), 'whisper-subtitle-tool')
        await mkdir(temporaryDirectory, { recursive: true })
        temporaryWavPath = path.join(temporaryDirectory, `${randomUUID()}.wav`)
      }
      const ffmpegArgs = ['-y']
      if (startSeconds > 0) {
        ffmpegArgs.push('-ss', startSeconds.toFixed(3))
      }
      ffmpegArgs.push('-i', options.inputPath)
      if (durationSeconds !== undefined) {
        ffmpegArgs.push('-t', durationSeconds.toFixed(3))
      }
      ffmpegArgs.push('-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', temporaryWavPath)

      const rangeLabel =
        durationSeconds === undefined
          ? '全部'
          : `${startSeconds.toFixed(0)}s–${(startSeconds + durationSeconds).toFixed(0)}s`
      sendStatus({
        state: 'running',
        message:
          extension === '.mp4'
            ? `正在将 MP4 转换为兼容的 WAV 音频（${rangeLabel}）…`
            : `正在裁剪音频片段（${rangeLabel}）…`,
      })
      sendLog(`> ffmpeg ${ffmpegArgs.map((arg) => JSON.stringify(arg)).join(' ')}`)
      const conversion = await runCommand('ffmpeg', ffmpegArgs, path.dirname(options.inputPath))
      if (isCancellationRequested() || conversion.signal) {
        sendStatus({ state: 'cancelled', message: '字幕生成已取消' })
        return
      }
      if (conversion.code !== 0) {
        throw new Error(`FFmpeg 转码失败（退出码：${conversion.code ?? '未知'}）`)
      }
      if (!existsSync(temporaryWavPath)) {
        throw new Error('FFmpeg 未生成 WAV 文件，无法继续识别')
      }
      transcriptionInputPath = temporaryWavPath
    }

    if (isCancellationRequested()) {
      sendStatus({ state: 'cancelled', message: '字幕生成已取消' })
      return
    }
    activeExecutable = 'whisper-cli'
    const whisperArgs = [
      '-m',
      options.modelPath,
      '-f',
      transcriptionInputPath,
      '-l',
      options.language,
      '--output-srt',
      '-of',
      outputBasePath,
      '--print-progress',
      '-t',
      String(options.threads),
    ]
    sendStatus({ state: 'running', message: '正在启动 whisper-cli…' })
    sendLog(`> whisper-cli ${whisperArgs.map((arg) => JSON.stringify(arg)).join(' ')}`)
    const transcription = await runCommand(
      'whisper-cli',
      whisperArgs,
      path.dirname(options.inputPath),
      true,
    )
    if (isCancellationRequested() || transcription.signal) {
      sendStatus({ state: 'cancelled', message: '字幕生成已取消' })
      return
    }
    if (transcription.code !== 0) {
      throw new Error(`whisper-cli 执行失败（退出码：${transcription.code ?? '未知'}）`)
    }
    if (!existsSync(outputPath)) {
      throw new Error(`whisper-cli 已结束，但未找到输出字幕文件：${outputPath}`)
    }
    if (startSeconds > 0) {
      sendStatus({ state: 'running', message: '正在将字幕时间戳对齐到原片…' })
      await shiftSrtTimestamps(outputPath, startSeconds)
    }
    sendStatus({
      state: 'success',
      message: convertedWavPath ? '字幕生成完成，已保留转换后的 WAV 文件' : '字幕生成完成',
      outputPath,
      convertedWavPath,
      progress: 100,
    })
  } catch (error) {
    if (isCancellationRequested()) {
      sendStatus({ state: 'cancelled', message: '字幕生成已取消' })
    } else if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      sendStatus({ state: 'error', message: executableError(activeExecutable, error) })
    } else {
      const message = error instanceof Error ? error.message : String(error)
      sendStatus({ state: 'error', message })
    }
  } finally {
    if (temporaryWavPath && !convertedWavPath) {
      await rm(temporaryWavPath, { force: true }).catch((error) => {
        sendLog(`临时 WAV 清理失败：${error instanceof Error ? error.message : String(error)}\n`)
      })
    }
    setActiveProcess(null)
    setTaskRunning(false)
    setCancellationRequested(false)
  }
}

export function cancelTranscription() {
  if (!isTaskRunning()) return
  setCancellationRequested(true)
  getActiveProcess()?.kill()
}
