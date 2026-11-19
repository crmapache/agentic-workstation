import { setTimeout as delay } from 'node:timers/promises'

import type { AcpProcess } from '../../acp/client/acp-process'
import { isAuthError } from '../../acp/client/acp-process'
import { ACP_SESSION_TIMEOUT_MS } from '../../acp/client/acp.constants'
import type { AcpMcpServer, AcpSessionSetup } from '../../acp/protocol/acp-types'

/**
 * Сколько раз и с какой паузой продолжать разговор, который держит другой процесс: у Kimi одна
 * сессия - один писатель, а каталог панели держит её секунду, пока повторяет для журнала шага.
 */
const OCCUPIED_RETRIES = 3
const OCCUPIED_PAUSE_MS = 1_500

/** Kimi: «This session is in use by another Kimi Code process» (SESSION_OCCUPIED). */
const isOccupied = (error: unknown): boolean =>
  error instanceof Error && /in use by another/i.test(error.message)

/** Сессия прогона у агента: её id, настройки и новая ли она (тогда бриф едет первым сообщением). */
export type AcpRunSession = { sessionId: string; setup: AcpSessionSetup; fresh: boolean }

/**
 * Сессия прогона: прошлая из журнала сессии - `session/resume` (историю не повторяет; без него -
 * `session/load`, повтор прогон не слушает), иначе новая в папке прогона с коннекторами. Прошлую
 * держит другой процесс - пара попыток с паузой, потом отказ: новая сессия молча потеряла бы
 * разговор. Агент её не знает (удалили) - новая, журнал перепишет шапку.
 */
export const openRunSession = async (
  process: AcpProcess,
  run: {
    known: string | null
    cwd: string
    servers: AcpMcpServer[]
    /** Поля указаний IDE, если агент умеет их в сессии (AcpAgent.instructions). */
    extra: Record<string, unknown>
  },
): Promise<AcpRunSession> => {
  const init = await process.initialized
  const sessions = init.agentCapabilities?.sessionCapabilities ?? {}
  const base = { cwd: run.cwd, mcpServers: run.servers, ...run.extra }
  const { known } = run
  const method = sessions.resume
    ? 'session/resume'
    : init.agentCapabilities?.loadSession
      ? 'session/load'
      : null

  for (let attempt = 0; known && method; attempt += 1) {
    try {
      const setup = (await process.request(
        method,
        { ...base, sessionId: known },
        ACP_SESSION_TIMEOUT_MS,
      )) as AcpSessionSetup | null

      return { sessionId: known, setup: setup ?? {}, fresh: false }
    } catch (error) {
      if (isAuthError(error) || (isOccupied(error) && attempt >= OCCUPIED_RETRIES)) throw error
      if (!isOccupied(error)) break

      await delay(OCCUPIED_PAUSE_MS)
    }
  }

  const created = (await process.request(
    'session/new',
    base,
    ACP_SESSION_TIMEOUT_MS,
  )) as AcpSessionSetup

  if (!created.sessionId) throw new Error('The agent started a session without an id.')

  return { sessionId: created.sessionId, setup: created, fresh: true }
}

/**
 * Разговоры агента, которые сейчас держат процессы прогонов: журнал шага такой сессии читает
 * журнал прогона, а не повтор у агента - второй процесс на ней получил бы отказ (Kimi) и только
 * шумел бы им каждые три секунды, пока карточка идёт.
 */
const held = new Map<string, number>()

/** Счётом, а не флагом: новый процесс того же разговора поднимается, пока старый гаснет. */
export const holdRunSession = (sessionId: string): void => {
  held.set(sessionId, (held.get(sessionId) ?? 0) + 1)
}

export const releaseRunSession = (sessionId: string): void => {
  const left = (held.get(sessionId) ?? 0) - 1

  if (left > 0) held.set(sessionId, left)
  else held.delete(sessionId)
}

export const isRunSessionHeld = (sessionId: string): boolean => held.has(sessionId)
