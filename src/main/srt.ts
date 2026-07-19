import { readFile, writeFile } from 'node:fs/promises'

function formatSrtTimestamp(totalMs: number) {
  const clamped = Math.max(0, Math.round(totalMs))
  const hours = Math.floor(clamped / 3_600_000)
  const minutes = Math.floor((clamped % 3_600_000) / 60_000)
  const seconds = Math.floor((clamped % 60_000) / 1000)
  const millis = clamped % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

export async function shiftSrtTimestamps(srtPath: string, offsetSeconds: number) {
  if (offsetSeconds <= 0) return
  const offsetMs = Math.round(offsetSeconds * 1000)
  const content = await readFile(srtPath, 'utf8')
  const shifted = content.replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, (_match, hh, mm, ss, ms) => {
    const totalMs =
      (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * 1000 + Number(ms) + offsetMs
    return formatSrtTimestamp(totalMs)
  })
  await writeFile(srtPath, shifted, 'utf8')
}
