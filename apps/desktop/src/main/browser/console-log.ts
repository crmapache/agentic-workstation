/**
 * Консоль вкладки агента (инструмент console): события CDP Runtime и Log → строки для модели.
 * Пишется, пока отладчик подключён - что было до этого, Chrome не повторяет.
 */

export type ConsoleEntry = { level: string; text: string; at: number }

/** Сколько последних записей держать на вкладку: модели нужен хвост, а не вся история. */
export const CONSOLE_LIMIT = 200

const TEXT_MAX = 2000

type RemoteObject = {
  type?: string
  subtype?: string
  value?: unknown
  unserializableValue?: string
  description?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Значение аргумента console.log словами: строка как есть, объект - его описание. */
const previewOf = (arg: RemoteObject): string => {
  if (arg.type === 'string' && typeof arg.value === 'string') return arg.value

  if (arg.unserializableValue) return arg.unserializableValue

  if (arg.type === 'undefined') return 'undefined'

  if (arg.value !== undefined) return JSON.stringify(arg.value)

  return arg.description ?? arg.type ?? ''
}

const clip = (text: string): string =>
  text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text

/** Запись консоли из события CDP; чужое событие - null. */
export const consoleEntryOf = (
  method: string,
  params: unknown,
  at: number,
): ConsoleEntry | null => {
  if (!isRecord(params)) return null

  if (method === 'Runtime.consoleAPICalled') {
    const args = Array.isArray(params['args']) ? (params['args'] as RemoteObject[]) : []
    const level = typeof params['type'] === 'string' ? params['type'] : 'log'

    return {
      level: level === 'warning' ? 'warn' : level,
      text: clip(args.map(previewOf).join(' ')),
      at,
    }
  }

  if (method === 'Runtime.exceptionThrown' && isRecord(params['exceptionDetails'])) {
    const details = params['exceptionDetails']
    const exception = isRecord(details['exception']) ? (details['exception'] as RemoteObject) : null
    const text =
      exception?.description ?? (typeof details['text'] === 'string' ? details['text'] : '')

    return { level: 'error', text: clip(text), at }
  }

  if (method === 'Log.entryAdded' && isRecord(params['entry'])) {
    const entry = params['entry']
    const url = typeof entry['url'] === 'string' && entry['url'] ? ` (${entry['url']})` : ''

    return {
      level: typeof entry['level'] === 'string' ? entry['level'] : 'info',
      text: clip(`${typeof entry['text'] === 'string' ? entry['text'] : ''}${url}`),
      at,
    }
  }

  return null
}

/** Добавить запись, держа не больше CONSOLE_LIMIT последних. */
export const appendConsole = (entries: ConsoleEntry[], entry: ConsoleEntry): void => {
  entries.push(entry)

  if (entries.length > CONSOLE_LIMIT) entries.splice(0, entries.length - CONSOLE_LIMIT)
}

/**
 * Весь ответ консоли не длиннее: записей до двухсот по две тысячи знаков - это 400 тысяч,
 * больше, чем шлюз и модель примут одним ответом.
 */
export const CONSOLE_OUTPUT_MAX = 20_000

/**
 * Хвост консоли строками `[error] текст`: не больше limit записей и не больше maxChars знаков
 * всего - свежие важнее, поэтому режутся старые, с пометкой, сколько.
 */
export const formatConsole = (
  entries: readonly ConsoleEntry[],
  limit: number,
  onlyErrors: boolean,
  maxChars = CONSOLE_OUTPUT_MAX,
): string => {
  const picked = entries.filter((entry) => !onlyErrors || entry.level === 'error').slice(-limit)
  const lines: string[] = []
  let chars = 0

  for (const entry of [...picked].reverse()) {
    const line = `[${entry.level}] ${entry.text}`

    if (chars + line.length + 1 > maxChars) break

    lines.unshift(line)
    chars += line.length + 1
  }

  const cut = picked.length - lines.length

  return cut ? [`… ${cut} earlier messages cut`, ...lines].join('\n') : lines.join('\n')
}
