export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

/** Файл базы в userData. */
export const STATS_DB_FILE = 'statistics.sqlite'

/**
 * Промежуток между записями транскрипта длиннее этого - не работа агента: человек ушёл,
 * а разговор лежал. Так оценка времени не тянет хода через обед.
 */
export const IDLE_GAP_MS = 15 * MINUTE_MS

/** Пауза присутствия длиннее этой делит рабочие сессии человека. */
export const WORK_SESSION_GAP_MINUTES = 30

/** Как часто дочитывать транскрипты в фоне. */
export const SCAN_INTERVAL_MS = 60_000

/** Окно узнаёт об изменениях не чаще этого: перерисовка графиков не бесплатна. */
export const CHANGED_THROTTLE_MS = 30_000

/**
 * Шаг сложения в SQL - четверть часа. Пояса со сдвигом в полчаса и 45 минут кратны ему,
 * так что местные часы и дни собираются из шагов без ошибки на границе.
 */
export const SLOT_MS = 15 * MINUTE_MS

/** Период не длиннее этого рисуется по часам, длиннее - по дням. */
export const HOURLY_PERIOD_MAX_MS = 2 * DAY_MS

/** Календарь активности - год, как у GitHub. */
export const CALENDAR_WEEKS = 53

/** Сколько строк в «частых»: инструменты, серверы, сценарии, языки. */
export const TOP_ROWS = 10

/** Длина окна пика: три дня недели и три часа. */
export const PEAK_SPAN = 3

/** Сколько байт транскрипта читать за раз. */
export const READ_CHUNK_BYTES = 1 << 20

/**
 * После стольких байт прочитанного строки пишутся в базу одной транзакцией вместе со
 * смещением файла: транзакция короткая, а оборванный проход продолжится с того же места.
 */
export const FLUSH_BYTES = 8 << 20

/** Провайдер транскриптов на диске - пока только Claude Code. */
export const TRANSCRIPT_PROVIDER = 'claude'
