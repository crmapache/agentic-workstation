import {
  MAX_PUSH_BYTES,
  PULL_PAGE_BYTES,
  MAX_ACCOUNT_BYTES,
  MAX_ACCOUNT_RECORDS,
} from '@agentic-workstation/cloud-protocol/api'

/**
 * Всё, что крутится без правки кода. Пределы протокола (тело записи, записей и места на аккаунт,
 * страница забора) берутся из пакета протокола: IDE режет пачки по тем же числам, и сервер строже
 * них отказывал бы исправной IDE. В Config они лежат, чтобы проверки могли их сузить.
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
  /** Новых аккаунтов в сутки с одного адреса: ключи бесплатны, место на диске - нет. */
  newAccountsPerDay: number
  /** Потолок тела запроса. */
  maxBodyBytes: number
  /** Потолок тел запросов в памяти разом: сверх него запрос с телом получает 503 до чтения. */
  maxBodyMemoryBytes: number
  /** Потолок записей одного аккаунта. */
  maxAccountRecords: number
  /** Потолок суммы длин шифра одного аккаунта. */
  maxAccountBytes: number
  /** Сколько знаков шифра в одной странице забора. */
  pullPageBytes: number
  /** Сколько места должно остаться на диске базы, чтобы принять запись; меньше - 507. */
  minFreeDiskBytes: number
  /** Сколько заборов одного аккаунта может ждать перемен разом; лишние отвечают сразу. */
  maxWaitsPerAccount: number
  /** Сколько заборов с одного адреса может ждать разом: ключей с адреса можно завести много. */
  maxWaitsPerCaller: number
  /** Сколько заборов всего может ждать разом: ожидание держит соединение и таймер. */
  maxWaits: number
  /** За сколько звонящий должен прислать заголовки целиком. */
  headersTimeoutMs: number
  /**
   * За сколько звонящий должен прислать запрос целиком (с телом). Ожидание забора сюда не
   * входит: GET без тела получен целиком сразу, а держит его уже сервер.
   */
  requestTimeoutMs: number
  /** Сколько разовых чисел подписей помнить разом; больше - 503 до смены поколения. */
  maxNonces: number
  /** Сколько ключей (адресов, аккаунтов) помнит каждый предел частоты; больше - 503. */
  maxTrackedKeys: number
}

const numberFrom = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const MIB = 1024 * 1024

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
  newAccountsPerDay: numberFrom(env['CLOUD_NEW_ACCOUNTS_PER_DAY'], 20),
  maxBodyBytes: MAX_PUSH_BYTES,
  // Шестнадцать пачек по 4 МиБ разом: исправной IDE хватает с запасом, память сервера цела.
  maxBodyMemoryBytes: 64 * MIB,
  maxAccountRecords: MAX_ACCOUNT_RECORDS,
  maxAccountBytes: MAX_ACCOUNT_BYTES,
  pullPageBytes: PULL_PAGE_BYTES,
  // SQLite на полном диске падает посреди записи (WAL, контрольные точки) - отказываем раньше.
  minFreeDiskBytes: numberFrom(env['CLOUD_MIN_FREE_DISK_BYTES'], 2 * 1024 * MIB),
  maxWaitsPerAccount: 8,
  maxWaitsPerCaller: 16,
  maxWaits: 5000,
  headersTimeoutMs: 10_000,
  requestTimeoutMs: 30_000,
  // Число - до 64 знаков: потолок держит книгу в паре десятков мегабайт.
  maxNonces: 200_000,
  maxTrackedKeys: 200_000,
})
