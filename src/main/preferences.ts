import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function modelPreferencesPath() {
  return path.join(app.getPath('userData'), 'preferences.json')
}

export async function saveLastModelPath(modelPath: string) {
  const preferencesPath = modelPreferencesPath()
  await mkdir(path.dirname(preferencesPath), { recursive: true })
  await writeFile(preferencesPath, JSON.stringify({ lastModelPath: modelPath }), 'utf8')
}

export async function getLastModelPath() {
  try {
    const preferences = JSON.parse(await readFile(modelPreferencesPath(), 'utf8')) as {
      lastModelPath?: unknown
    }
    return typeof preferences.lastModelPath === 'string' && existsSync(preferences.lastModelPath)
      ? preferences.lastModelPath
      : null
  } catch {
    return null
  }
}
