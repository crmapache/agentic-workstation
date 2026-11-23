import type { CalendarEvent, CalendarFailure } from '@shared/calendar'
import { SECOND_MS } from '@shared/time-units'

import type { SyncWindow } from '../calendar-window'
import { parseIcs } from './ics-parse'

/** Сколько ждать сервер календаря: подписка - один файл, дольше - значит, он лежит. */
const ICS_TIMEOUT_MS = 15 * SECOND_MS

/** Предел файла: годовой календарь с повторами - сотни килобайт, а не десятки мегабайт. */
const ICS_BYTES_MAX = 10 * 1024 * 1024

export type SourceRead =
  { ok: true; events: CalendarEvent[] } | { ok: false; failure: CalendarFailure }

class TooLargeError extends Error {}

/** Тело до потолка: больше - отказ, а не весь файл в память. */
const readCapped = async (response: Response): Promise<string> => {
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader()

  if (!reader) return ''

  const chunks: Uint8Array[] = []
  let size = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) return Buffer.concat(chunks).toString('utf8')

    chunks.push(value)
    size += value.byteLength

    if (size > ICS_BYTES_MAX) {
      await reader.cancel().catch(() => undefined)
      throw new TooLargeError()
    }
  }
}

/** Отказ сети - кодом: отменил человек, вышел срок или сервер не ответил. */
const failureOf = (error: unknown, signal: AbortSignal): CalendarFailure => {
  if (error instanceof TooLargeError) return 'too-large'
  if (signal.aborted) return 'cancelled'

  return error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'network'
}

/**
 * Подписка ICS: файл по ссылке и его события в окне. Ссылка - секрет человека (в ней ключ
 * доступа), в журнал она не пишется.
 */
export const readIcs = async (
  url: string,
  sourceId: string,
  window: SyncWindow,
  signal: AbortSignal,
  machineZone: string,
  fetchFn: typeof fetch = fetch,
): Promise<SourceRead> => {
  try {
    const response = await fetchFn(url, {
      headers: { accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(ICS_TIMEOUT_MS)]),
    })

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      console.warn(`[calendar] ICS ответил ${response.status}`)

      return {
        ok: false,
        failure: response.status === 404 || response.status === 410 ? 'not-found' : 'http',
      }
    }

    const events = parseIcs(await readCapped(response), sourceId, window, machineZone)

    return events ? { ok: true, events } : { ok: false, failure: 'parse' }
  } catch (error) {
    const failure = failureOf(error, signal)

    if (failure === 'network') console.warn('[calendar] ICS не загрузился', error)

    return { ok: false, failure }
  }
}
