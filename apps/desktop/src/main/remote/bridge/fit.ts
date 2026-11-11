import { utf8Length } from '@agentic-workstation/remote-protocol/body'
import { MAX_BODY_BYTES } from '@agentic-workstation/remote-protocol/frame'
import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'

/**
 * Что влезает в кадр релея и что уходит телефону. Переросший кадр релей не режет, а закрывает
 * сокет вместе со всем остальным, поэтому дорога до телефона меряет каждое тело заранее.
 * Длинные строки внутри (вывод команды, содержимое файла) режутся и говорят об этом в самом
 * тексте, а не пропадают. Тот же обход строк прячет папки машины (redact.ts): телефону -
 * {project}/src/app.ts, окну IDE - путь как есть.
 */

/** Сколько тела под содержимое: остальное - конверт сообщения (вид, номер, id разговора). */
export const BODY_BUDGET = MAX_BODY_BYTES - 2048

/** Как коротко резать длинный текст - по очереди, пока элемент не влезет. */
export const STRING_LIMITS = [8 * 1024, 1024, 200] as const

/** Подпись обрезки - своя: режет дорога до телефона, а в IDE всё целиком. */
export const PHONE_NOTE = '\n… [not shown on the phone: too big, the full text is in the IDE]'

/** Строка - строке: подмена папок машины метками. Без папок - как есть. */
export type Redact = (text: string) => string

export const asIs: Redact = (text) => text

export const sizeOf = (value: unknown): number => utf8Length(JSON.stringify(value) ?? '')

/** Каждую строку значения - через fn; keys - и имена полей (путь бывает ключом карты). */
const walk = (value: unknown, fn: (text: string) => string, keys: boolean): unknown => {
  if (typeof value === 'string') return fn(value)
  if (Array.isArray(value)) return value.map((item) => walk(item, fn, keys))

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [keys ? fn(key) : key, walk(item, fn, keys)]),
    )
  }

  return value
}

/**
 * Начало строки и пометка. Строка, которая с пометкой не стала бы короче (201-266 знаков при
 * пределе 200), остаётся как есть: обрезка не должна удлинять.
 */
const cut = (text: string, limit: number): string =>
  text.length > limit + PHONE_NOTE.length ? `${text.slice(0, limit)}${PHONE_NOTE}` : text

export const cutStrings = (value: unknown, limit: number): unknown =>
  walk(value, (text) => cut(text, limit), false)

export const redactStrings = (value: unknown, redact: Redact): unknown =>
  redact === asIs ? value : walk(value, redact, true)

/** Значение без папок машины целиком, иначе со всё более короткими строками; не влезает - null. */
export const fitValue = <T>(
  value: T,
  budget: number = BODY_BUDGET,
  redact: Redact = asIs,
): T | null => {
  const clean = redactStrings(value, redact) as T

  if (sizeOf(clean) <= budget) return clean

  for (const limit of STRING_LIMITS) {
    const shorter = cutStrings(clean, limit) as T

    if (sizeOf(shorter) <= budget) return shorter
  }

  return null
}

const isScalar = (value: unknown): boolean =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value)

/**
 * Карточка вместо элемента, который не влез и урезанным (тысячи строк вывода массивом, огромный
 * флот агентов): id, вид и простые поля (состояние, имя, короткий текст), `stub: true`. Элемент
 * не пропадает из ленты молча - телефон видит, что он есть и что целиком он в IDE.
 */
const stubOf = (item: FeedItemWire, budget: number, redact: Redact): FeedItemWire => {
  const scalars = Object.fromEntries(Object.entries(item).filter(([, field]) => isScalar(field)))
  const card = { ...(fitValue(scalars, budget, redact) ?? {}), id: item.id, kind: item.kind }
  const stub = { ...card, stub: true }

  return sizeOf(stub) <= budget ? stub : { id: item.id, kind: item.kind, stub: true }
}

/** Элемент ленты в кадр: целиком, урезанным или карточкой - но не пропадает. */
export const fitItem = (
  item: FeedItemWire,
  budget: number = BODY_BUDGET,
  redact: Redact = asIs,
): FeedItemWire => fitValue(item, budget, redact) ?? stubOf(item, budget, redact)

/**
 * Хвост списка, который влезает в один кадр, - от конца к началу, не больше max штук. cut -
 * выше осталось ещё (лента: снимок честно говорит, что неполон, и телефон просит выше страницами).
 */
export const tailThatFits = <T extends FeedItemWire>(
  items: readonly T[],
  budget: number,
  max: number,
  redact: Redact = asIs,
): { items: FeedItemWire[]; cut: boolean } => {
  const kept: FeedItemWire[] = []
  let used = 0

  for (let index = items.length - 1; index >= 0 && kept.length < max; index -= 1) {
    const raw = items[index]

    if (raw === undefined) continue

    const item = fitItem(raw, budget, redact)
    const size = sizeOf(item) + 1

    if (used + size > budget) break

    kept.unshift(item)
    used += size
  }

  return { items: kept, cut: kept.length < items.length }
}

/** Список пачками, каждая влезает в кадр; порядок сохраняется, ни один элемент не теряется. */
export const packsThatFit = <T extends FeedItemWire>(
  items: readonly T[],
  budget: number = BODY_BUDGET,
  redact: Redact = asIs,
): FeedItemWire[][] => {
  const packs: FeedItemWire[][] = []
  let pack: FeedItemWire[] = []
  let used = 0

  for (const raw of items) {
    const item = fitItem(raw, budget, redact)
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

/** Список, который должен уйти в одном кадре с другим (задачи ленты): целиком или его хвост. */
export const listThatFits = <T>(
  items: readonly T[],
  budget: number,
  redact: Redact = asIs,
): T[] => {
  const whole = fitValue(items, budget, redact)

  if (whole) return [...whole]

  const kept: T[] = []
  let used = 2

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const raw = items[index]
    const item = raw === undefined ? null : fitValue(raw, budget, redact)

    if (item === null) continue

    const size = sizeOf(item) + 1

    if (used + size > budget) break

    kept.unshift(item)
    used += size
  }

  return kept
}
