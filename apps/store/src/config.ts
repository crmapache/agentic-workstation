/**
 * Всё, что крутится без правки кода. Пределы - скромные: магазин хранит текст пакетов и отзывы,
 * и каждый предел отвечает на вопрос «сколько этого стоит держать».
 */

export const STORE_VERSION = '0.1.0'

/** Порт магазина локально и в контейнере (записан в ~/.claude/ports.md). */
export const DEFAULT_PORT = 4463

export type Config = {
  port: number
  /** Папка базы SQLite: в контейнере - том. */
  dataDir: string
  /** Ключ модерации: убрать чужое расширение, прочитать жалобы. Пусто - модерации нет. */
  adminToken: string
  /** Верить X-Forwarded-For от ближнего собеседника из своей сети: за прокси Coolify. */
  trustProxy: boolean
  /** Потолок тела запроса: пакет до 2 МБ текста и JSON вокруг него. */
  maxBodyBytes: number
  /** Запросов в минуту с одного адреса: чтение и запись отдельно. */
  readsPerMinute: number
  writesPerMinute: number
  /** Публикаций в час с одного ключа. */
  publishesPerHour: number
}

const numberFrom = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const configFromEnv = (env: NodeJS.ProcessEnv): Config => ({
  port: numberFrom(env['PORT'], DEFAULT_PORT),
  dataDir: env['STORE_DATA_DIR'] ?? '/data',
  adminToken: env['STORE_ADMIN_TOKEN'] ?? '',
  trustProxy: env['STORE_TRUST_PROXY'] === '1',
  maxBodyBytes: numberFrom(env['STORE_MAX_BODY_BYTES'], 3 * 1024 * 1024),
  readsPerMinute: numberFrom(env['STORE_READS_PER_MINUTE'], 300),
  writesPerMinute: numberFrom(env['STORE_WRITES_PER_MINUTE'], 30),
  publishesPerHour: numberFrom(env['STORE_PUBLISHES_PER_HOUR'], 20),
})
