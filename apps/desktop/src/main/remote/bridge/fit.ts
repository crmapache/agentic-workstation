import { utf8Length } from '@agentic-workstation/remote-protocol/body'
import { MAX_BODY_BYTES } from '@agentic-workstation/remote-protocol/frame'

/**
 * Что влезает в кадр релея. Переросший кадр релей не режет, а закрывает сокет вместе со всем
 * остальным, поэтому дорога до телефона меряет каждое тело заранее. Длинные строки внутри
 * (вывод команды, содержимое файла) режутся и говорят об этом в самом тексте, а не пропадают.
 */

/** Сколько тела под содержимое: остальное - конверт сообщения (вид, номер, id разговора). */
export const BODY_BUDGET = MAX_BODY_BYTES - 2048

/** Как коротко резать длинный текст - по очереди, пока элемент не влезет. */
const STRING_LIMITS = [8 * 1024, 1024, 200]

/** Подпись обрезки - своя: режет дорога до телефона, а в IDE всё целиком. */
export const PHONE_NOTE = '\n… [not shown on the phone: too big, the full text is in the IDE]'

export const sizeOf = (value: unknown): number => utf8Length(JSON.stringify(value) ?? '')

export const cutStrings = (value: unknown, limit: number): unknown => {
  if (typeof value === 'string')
    return value.length > limit ? `${value.slice(0, limit)}${PHONE_NOTE}` : value
  if (Array.isArray(value)) return value.map((item) => cutStrings(item, limit))

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cutStrings(item, limit)]),
    )
  }

  return value
}

/** Значение целиком, иначе со всё более короткими строками; не влезает и так - null. */
export const fitValue = <T>(value: T, budget: number = BODY_BUDGET): T | null => {
  if (sizeOf(value) <= budget) return value

  for (const limit of STRING_LIMITS) {
    const shorter = cutStrings(value, limit) as T

    if (sizeOf(shorter) <= budget) return shorter
  }

  return null
}

/**
 * Хвост списка, который влезает в один кадр, - от конца к началу, не больше max штук. cut -
 * выше осталось ещё (лента: «load earlier» на телефоне нет, снимок честно говорит, что неполон).
 */
export const tailThatFits = <T>(
  items: readonly T[],
  budget: number,
  max: number,
): { items: T[]; cut: boolean } => {
  const kept: T[] = []
  let used = 0

  for (let index = items.length - 1; index >= 0 && kept.length < max; index -= 1) {
    const raw = items[index]
    const item = raw === undefined ? null : fitValue(raw, budget)

    if (item === null) continue

    const size = sizeOf(item) + 1

    if (used + size > budget) break

    kept.unshift(item)
    used += size
  }

  return { items: kept, cut: kept.length < items.length }
}

/** Список пачками, каждая влезает в кадр; порядок сохраняется. Не влезающий и урезанным - выброшен. */
export const packsThatFit = <T>(items: readonly T[], budget: number = BODY_BUDGET): T[][] => {
  const packs: T[][] = []
  let pack: T[] = []
  let used = 0

  for (const raw of items) {
    const item = fitValue(raw, budget)

    if (item === null) {
      console.warn('[remote] элемент ленты не влезает в кадр даже урезанным - выброшен')
      continue
    }

    const size = sizeOf(item) + 1

    if (used + size > budget && pack.length > 0) {
      packs.push(pack)
      pack = []
      used = 0
    }

    pack.push(item)
    used += size
  }

  if (pack.length > 0) packs.push(pack)

  return packs
}
