import type { BrowserWindow } from 'electron'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { WhisperStatus } from '../types'

let mainWindow: BrowserWindow | null = null
let activeProcess: ChildProcessWithoutNullStreams | null = null
let taskRunning = false
let cancellationRequested = false

export function getMainWindow() {
  return mainWindow
}

export function setMainWindow(window: BrowserWindow | null) {
  mainWindow = window
}

export function getActiveProcess() {
  return activeProcess
}

export function setActiveProcess(process: ChildProcessWithoutNullStreams | null) {
  activeProcess = process
}

export function isTaskRunning() {
  return taskRunning
}

export function setTaskRunning(running: boolean) {
  taskRunning = running
}

export function isCancellationRequested() {
  return cancellationRequested
}

export function setCancellationRequested(requested: boolean) {
  cancellationRequested = requested
}

export function sendStatus(status: WhisperStatus) {
  mainWindow?.webContents.send('whisper:status', status)
}

export function sendLog(line: string) {
  mainWindow?.webContents.send('whisper:log', line)
}
