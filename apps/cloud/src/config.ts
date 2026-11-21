import { MAX_PUSH_BYTES, MAX_ACCOUNT_RECORDS } from '@agentic-workstation/cloud-protocol/api'

/**
 * Всё, что крутится без правки кода. Пределы протокола (тело записи, записей на аккаунт) берутся
 * из пакета протокола: IDE режет пачки по тем же числам, и сервер строже них отказывал бы
 * исправной IDE. В Config они лежат, чтобы проверки могли их сузить.
 */

/** Порт облака локально и в контейнере (записан в ~/.claude/ports.md). */
export const DEFAULT_PORT = 4464

export type Config = {
  port: number
  /** Метка сборки от скрипта выкладки: по ней видно в /v1/info, что выложено. */
  build: string
  /** Папка базы SQLite: в контейнере - том. */
  dataDir: string
  /** Верить X-Forwarded-For от ближнего собеседника из своей сети: за прокси Coolify. */
  trustProxy: boolean
  /** Запросов в минуту с одного адреса: чтение и запись отдельно. */
  readsPerMinute: number
  writesPerMinute: number
  /** Подписанных запросов в минуту на один аккаунт со всех его компьютеров. */
  accountRequestsPerMinute: number
  /** Потолок тела запроса. */
  maxBodyBytes: number
  /** Потолок записей одного аккаунта. */
  maxAccountRecords: number
  /** Сколько заборов одного аккаунта может ждать перемен разом; лишние отвечают сразу. */
  maxWaitsPerAccount: number
  /** Сколько заборов всего может ждать разом: ожидание держит соединение и таймер. */
  maxWaits: number
}

const numberFrom = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const configFromEnv = (env: NodeJS.ProcessEnv): Config => ({
  port: numberFrom(env['PORT'], DEFAULT_PORT),
  build: env['CLOUD_BUILD'] ?? 'dev',
  dataDir: env['CLOUD_DATA_DIR'] ?? '/data',
  trustProxy: env['CLOUD_TRUST_PROXY'] === '1',
  // Забор ждёт перемен до 25 секунд и сразу встаёт снова, а первая сверка большого аккаунта -
  // сотни страниц подряд: чтению нужен запас шире, чем у магазина.
  readsPerMinute: numberFrom(env['CLOUD_READS_PER_MINUTE'], 600),
  writesPerMinute: numberFrom(env['CLOUD_WRITES_PER_MINUTE'], 120),
  accountRequestsPerMinute: numberFrom(env['CLOUD_ACCOUNT_REQUESTS_PER_MINUTE'], 600),
  maxBodyBytes: MAX_PUSH_BYTES,
  maxAccountRecords: MAX_ACCOUNT_RECORDS,
  maxWaitsPerAccount: 8,
  maxWaits: 5000,
})
