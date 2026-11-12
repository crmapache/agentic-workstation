/**
 * Ссылка на вкладку для ИИ (пункт «Copy tab reference for AI»): профиль Chrome, id вкладки и
 * метка запуска браузера. В буфер уходит `chrome-tab:<профиль>/<id>@<метка> "Заголовок"`.
 *
 * Метка нужна, потому что id вкладок Chrome живут до перезапуска браузера, а потом раздаются
 * заново: старая ссылка из разговора указала бы на чужую вкладку. Расширение заводит новую
 * метку на каждом старте Chrome, и ссылку с другой меткой IDE не принимает. Ссылку без метки
 * (модель написала номер сама) IDE сверяет по заголовку, если он есть.
 */
export const TAB_REFERENCE_PREFIX = 'chrome-tab:'

export type TabReference = {
  profileKey: string
  tabId: number
  /** Метка запуска Chrome, в котором выдана ссылка; нет - null. */
  launch?: string | null
}

/** Ссылка из текста: то, что в ней есть, и заголовок в кавычках после неё. */
export type ParsedTabReference = {
  profileKey: string
  tabId: number
  launch: string | null
  title: string | null
}

/** Ключ профиля: короткий id установки расширения - строчные латинские буквы и цифры. */
export const PROFILE_KEY_PATTERN = /^[a-z0-9]{4,32}$/

/** Ключ профиля, id вкладки и метка запуска Chrome (короткая - ссылка остаётся читаемой). */
const REFERENCE = /^(?:chrome-tab:)?([a-z0-9]{4,32})\/(\d{1,12})(?:@([a-z0-9]{4,16}))?$/

/** Обёртки, в которые модель или человек могли взять ссылку: кавычки, `код`, <…>. */
const WRAPPERS = /^[`'"<«(]+|[`'">»),.;:]+$/g

/** Заголовок после ссылки: в прямых или «ёлочных» кавычках. */
const TITLE = /^\S+\s+["«“](.*)["»”]\s*$/s

export const formatTabReference = (reference: TabReference, title?: string): string => {
  const marker = reference.launch ? `@${reference.launch}` : ''
  const head = `${TAB_REFERENCE_PREFIX}${reference.profileKey}/${reference.tabId}${marker}`
  const clean = title?.replace(/\s+/g, ' ').trim()

  return clean ? `${head} "${clean}"` : head
}

/**
 * Ссылка из строки: первое слово, с приставкой chrome-tab: или без неё (`abcd1234/42`), с
 * меткой запуска или без. Заголовок после неё и обёртки вокруг не мешают. Не ссылка - null.
 */
export const parseTabReference = (text: string): ParsedTabReference | null => {
  const trimmed = text.trim()
  const [first = ''] = trimmed.split(/\s+/)
  const match = REFERENCE.exec(first.replace(WRAPPERS, ''))

  if (!match?.[1] || !match[2]) return null

  const tabId = Number(match[2])
  const title = TITLE.exec(trimmed)?.[1]?.trim()

  return Number.isSafeInteger(tabId)
    ? { profileKey: match[1], tabId, launch: match[3] ?? null, title: title || null }
    : null
}

/**
 * Тот ли это заголовок. Строгое равенство отказывало бы почти всегда: счётчики («Inbox (3)»)
 * и время в заголовке меняются сами. Поэтому сравниваются буквы без цифр, знаков и регистра,
 * и короткий заголовок может быть частью длинного (сайт дописал имя раздела).
 */
export const sameTabTitle = (a: string, b: string): boolean => {
  const letters = (text: string) =>
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\p{N}\p{P}\p{S}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const left = letters(a)
  const right = letters(b)

  if (!left || !right) return left === right

  return left === right || left.includes(right) || right.includes(left)
}
