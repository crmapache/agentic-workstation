import type { FeedItemWire, FeedStepsWire } from '@agentic-workstation/remote-protocol/wire-types'

import type { Redact } from './fit'
import { asIs, sizeOf, fitItem } from './fit'

/**
 * Окно ленты для телефона - в строках, которые он рисует, а не в элементах IDE. Шаг субагента,
 * чей вызов есть в ленте, строкой не считается и на провод не идёт: телефон, как окно IDE
 * (buildFeedRows), показывает его числом на строке вызова, а число едет рядом (steps). Считай
 * окно элементами - сотни шагов долгого субагента вытесняли бы из снимка и страницы сами
 * строки, вместе со строкой вызова и его Stop, и «Load earlier» подгружал бы невидимое. Шаг без
 * вызова в ленте (агент скилла, вызов выше загруженного транскрипта) - обычная строка.
 */

/** Строки окна, счёт шагов их вызовов; cut - выше осталась строка, которая не влезла. */
export type FeedWindow = { items: FeedItemWire[]; steps: FeedStepsWire; cut: boolean }

/** Вызов субагента, внутри которого случился элемент; null - верхний уровень разговора. */
export const parentOf = (item: FeedItemWire): string | null => {
  const parent = item['parentToolUseId']

  return typeof parent === 'string' && parent !== '' ? parent : null
}

const isStepIn = (item: FeedItemWire, ids: ReadonlySet<string>): boolean => {
  const parent = parentOf(item)

  return parent !== null && ids.has(parent)
}

/** Сколько шагов у каждого вызова - по всей ленте, а не по тому, что влезло в кадр. */
const countSteps = (items: readonly FeedItemWire[], ids: ReadonlySet<string>) => {
  const counts = new Map<string, number>()

  for (const item of items) {
    const parent = parentOf(item)

    if (parent !== null && ids.has(parent)) counts.set(parent, (counts.get(parent) ?? 0) + 1)
  }

  return counts
}

/** Место счёта одного вызова в кадре: `"id":n,`. */
const entrySize = (id: string, count: number) => sizeOf(id) + String(count).length + 2

/**
 * Строки перед end (индекс в ленте), от ближней к дальней, не больше maxRows и в budget байт
 * вместе со счётом шагов. Каждая строка меряется целым бюджетом: не влезшая целиком приходит
 * следующей страницей, а не урезанной. Ближняя строка влезает всегда (урезанной или
 * карточкой) - окно с «есть ещё» выше не бывает пустым, и кнопка всегда что-то приносит.
 */
const windowEndingAt = (
  items: readonly FeedItemWire[],
  end: number,
  budget: number,
  maxRows: number,
  redact: Redact,
): FeedWindow => {
  const ids = new Set(items.map((item) => item.id))
  const counts = countSteps(items, ids)
  const kept: FeedItemWire[] = []
  const steps: FeedStepsWire = {}
  let used = 0
  let cut = false

  for (let index = end - 1; index >= 0; index -= 1) {
    const raw = items[index]

    if (raw === undefined || isStepIn(raw, ids)) continue
    if (kept.length >= maxRows) {
      cut = true
      break
    }

    const count = counts.get(raw.id) ?? 0
    const entry = count > 0 ? entrySize(raw.id, count) : 0
    const item = fitItem(raw, budget - entry - 1, redact)
    const size = sizeOf(item) + 1 + entry

    if (used + size > budget) {
      cut = true
      break
    }

    kept.push(item)
    used += size
    if (count > 0) steps[raw.id] = count
  }

  return { items: kept.reverse(), steps, cut }
}

/** Конец ленты - снимок и первая страница журнала шага. */
export const tailWindow = (
  items: readonly FeedItemWire[],
  budget: number,
  maxRows: number,
  redact: Redact = asIs,
): FeedWindow => windowEndingAt(items, items.length, budget, maxRows, redact)

/** Строки перед элементом before; null - такого элемента в ленте нет. */
export const windowBefore = (
  items: readonly FeedItemWire[],
  before: string,
  budget: number,
  maxRows: number,
  redact: Redact = asIs,
): FeedWindow | null => {
  const end = items.findIndex((item) => item.id === before)

  return end === -1 ? null : windowEndingAt(items, end, budget, maxRows, redact)
}

/** Есть ли выше before строка, которую телефон нарисует; null - before в ленте нет. */
export const hasRowBefore = (items: readonly FeedItemWire[], before: string): boolean | null => {
  const end = items.findIndex((item) => item.id === before)

  if (end === -1) return null

  const ids = new Set(items.map((item) => item.id))

  return items.slice(0, end).some((item) => !isStepIn(item, ids))
}
