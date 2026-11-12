import { MINUTE_MS, SECOND_MS } from '@shared/time-units'
import type { ManualEntry, PresenceEntry } from '@shared/ipc/statistics.contract'

import { invoke } from './ipc'

/**
 * Живая активность человека для статистики (docs/workplan/20-statistics.md): минуты присутствия
 * в окне и правки руками. Копится в памяти и уходит пачкой раз в полминуты и при уходе из
 * окна - на каждую букву главный процесс не дёргается.
 */

const FLUSH_MS = 30 * SECOND_MS

const presence = new Map<string, PresenceEntry>()
const manual = new Map<string, ManualEntry>()
let timer: number | null = null

const schedule = () => {
  timer ??= window.setTimeout(() => {
    timer = null
    flushActivity()
  }, FLUSH_MS)
}

/** Человек был в окне в эту минуту (проект - активная вкладка, null - без проекта). */
export const notePresence = (projectId: string | null, now = Date.now()): void => {
  const minute = Math.floor(now / MINUTE_MS)
  const key = `${minute}:${projectId ?? ''}`

  if (presence.has(key)) return

  presence.set(key, { minute, projectId })
  schedule()
}

export type ManualDelta = { typed: number; pasted: number; added: number; removed: number }

/** Правка руками в файле проекта: знаки и строки складываются по минуте и расширению. */
export const noteManual = (
  projectId: string,
  ext: string,
  delta: ManualDelta,
  now = Date.now(),
): void => {
  if (delta.typed + delta.pasted + delta.added + delta.removed === 0) return

  const minute = Math.floor(now / MINUTE_MS)
  const key = `${minute}:${projectId}:${ext}`
  const row = manual.get(key) ?? {
    minute,
    projectId,
    ext,
    typed: 0,
    pasted: 0,
    added: 0,
    removed: 0,
  }

  manual.set(key, {
    ...row,
    typed: row.typed + delta.typed,
    pasted: row.pasted + delta.pasted,
    added: row.added + delta.added,
    removed: row.removed + delta.removed,
  })
  schedule()
}

/** Отправить накопленное сейчас: уход из окна, закрытие. Отказ главного процесса не повторяется. */
export const flushActivity = (): void => {
  if (presence.size === 0 && manual.size === 0) return

  const request = { presence: [...presence.values()], manual: [...manual.values()] }

  presence.clear()
  manual.clear()
  void invoke('stats:noteActivity', request).catch(() => undefined)
}
