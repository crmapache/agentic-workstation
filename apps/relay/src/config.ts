import { join } from 'node:path'

import type { PushKeys } from './push-keys.ts'
import { readPushKeys } from './push-keys.ts'

/**
 * Всё, что крутится без правки кода. Значения по умолчанию - боевые и намеренно скромные:
 * релей держит в памяти чужой трафик и ничего больше, поэтому каждый предел отвечает на
 * вопрос «сколько этого стоит держать», и ответ всегда «как можно меньше, лишь бы работало».
 */

export const RELAY_VERSION = '0.1.0'

/** Порт релея локально и в контейнере (записан в ~/.claude/ports.md). */
export const DEFAULT_PORT = 4460

export type Config = {
  port: number
  /** Потолок кадра - он же maxPayload сокета: проверка после сборки сообщения ничего не держит. */
  maxFrameBytes: number
  mailboxTtlMs: number
  mailboxMaxFrames: number
  mailboxMaxBytes: number
  /** Все ящики вместе: кадры в никуда не должны съесть память релея. */
  mailboxTotalBytes: number
  /** Кадров в минуту на соединение - потолок против зациклившейся стороны, не квота. */
  rateFramesPerMinute: number
  maxConnectionsPerIp: number
  maxConnections: number
  /** Какие страницы-источники могут открыть сокет; пусто - только страница самого релея. */
  allowedOrigins: string[]
  /**
   * Верить X-Forwarded-For от ближнего собеседника из своей сети: за прокси (Coolify, Traefik)
   * адрес соединения - адрес прокси. Выключено, пока не сказано RELAY_TRUST_PROXY=1: релей без
   * прокси, поверивший заголовку, дал бы любому назваться кем угодно.
   */
  trustProxy: boolean
  /** Как часто спрашивать сокет «жив?»: не ответил до следующего раза - закрыт. */
  pingIntervalMs: number
  /** Сколько ждать ответа на вызов «докажи, что адрес твой». */
  claimPatienceMs: number
  /** Где лежит телефонный клиент; пусто - не раздавать. */
  staticDir: string
  logLevel: 'silent' | 'info'
  /** Метка сборки образа (скрипт выкладки): по ней проверка после выкладки узнаёт новый контейнер. */
  build: string
  /** Ключи VAPID - подпись релея перед службами пушей; null - пуши выключены (pushOff - почему). */
  push: PushKeys | null
  pushOff: string
  /** Пушей в минуту от одной IDE: её уведомления и так сложены по разговору и виду. */
  pushPerMinute: number
  /** Пушей в минуту на весь релей: чужой поток не должен испортить ключ VAPID у служб. */
  pushTotalPerMinute: number
  /** Сколько служба держит пуш для выключенного телефона. */
  pushTtlSeconds: number
}

type Env = Record<string, string | undefined>

const positive = (env: Env, name: string, fallback: number): number => {
  const parsed = Number(env[name] ?? '')

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** Папка public рядом с src - и в репозитории, и в образе. */
const DEFAULT_STATIC = join(import.meta.dirname, '..', 'public')

export const readConfig = (env: Env = process.env): Config => ({
  ...readPushKeys(env),
  pushPerMinute: positive(env, 'RELAY_PUSH_PER_MINUTE', 30),
  pushTotalPerMinute: positive(env, 'RELAY_PUSH_TOTAL_PER_MINUTE', 1200),
  // Четыре часа: разрешение, отвеченное за столом утром, к полуночи никому не нужно, а
  // устаревшее уведомление хуже никакого - зовёт смотреть разговор, который ушёл дальше.
  pushTtlSeconds: positive(env, 'RELAY_PUSH_TTL_SECONDS', 4 * 60 * 60),
  port: env['PORT'] === '0' ? 0 : positive(env, 'PORT', DEFAULT_PORT),
  maxFrameBytes: positive(env, 'RELAY_MAX_FRAME_BYTES', 256 * 1024),
  mailboxTtlMs: positive(env, 'RELAY_MAILBOX_TTL_SECONDS', 120) * 1000,
  mailboxMaxFrames: positive(env, 'RELAY_MAILBOX_MAX_FRAMES', 200),
  mailboxMaxBytes: positive(env, 'RELAY_MAILBOX_MAX_BYTES', 4 * 1024 * 1024),
  mailboxTotalBytes: positive(env, 'RELAY_MAILBOX_TOTAL_BYTES', 64 * 1024 * 1024),
  rateFramesPerMinute: positive(env, 'RELAY_RATE_FRAMES_PER_MINUTE', 6000),
  maxConnectionsPerIp: positive(env, 'RELAY_MAX_CONNECTIONS_PER_IP', 32),
  maxConnections: positive(env, 'RELAY_MAX_CONNECTIONS', 2000),
  allowedOrigins: (env['RELAY_ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: env['RELAY_TRUST_PROXY'] === '1',
  pingIntervalMs: positive(env, 'RELAY_PING_SECONDS', 20) * 1000,
  claimPatienceMs: positive(env, 'RELAY_CLAIM_SECONDS', 10) * 1000,
  staticDir: env['RELAY_STATIC_DIR'] ?? DEFAULT_STATIC,
  logLevel: env['RELAY_LOG_LEVEL'] === 'silent' ? 'silent' : 'info',
  build: env['RELAY_BUILD'] ?? 'dev',
})
