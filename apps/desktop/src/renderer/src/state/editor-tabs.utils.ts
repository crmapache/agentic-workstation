import { isInsideAny, movedPathOf } from '../lib/path.utils'
import type { TabTarget, EditorTabs } from './editor-tabs.types'

export const NO_TABS: EditorTabs = { keys: [], recent: [] }

/**
 * Начало ключа вкладки разницы. Нуля в пути файла не бывает ни на одной файловой системе:
 * ключ разницы не спутать ни с каким файлом, даже с файлом «diff».
 */
const DIFF_PREFIX = '\u0000diff\u0000'

/** Ключ вкладки разницы файла. */
export const diffTabKey = (path: string): string => `${DIFF_PREFIX}${path}`

/** Что за вкладкой с этим ключом: файл или разница файла. */
export const tabTarget = (key: string): TabTarget =>
  key.startsWith(DIFF_PREFIX)
    ? { kind: 'diff', path: key.slice(DIFF_PREFIX.length) }
    : { kind: 'file', path: key }

/** Активная вкладка - последняя выбранная. undefined - вкладок нет. */
export const activeTab = (tabs: EditorTabs | undefined): string | undefined => tabs?.recent.at(-1)

const without = (keys: readonly string[], drop: ReadonlySet<string>) =>
  keys.filter((key) => !drop.has(key))

/**
 * Открыть вкладку: открытую - сделать активной на её месте в полосе, новую - открыть в
 * конце. Вкладок стало больше предела - закрываются самые давние из открытых, кроме
 * удерживаемых (held - пути файлов с несохранённым, которое молча не закрыть; держат и
 * вкладку файла, и разницу с ним). Все удерживаются - полоса временно длиннее предела:
 * потерять правку хуже лишней вкладки.
 */
export const openTab = (
  tabs: EditorTabs,
  key: string,
  { limit, held }: { limit: number; held: ReadonlySet<string> },
): EditorTabs => {
  const recent = [...tabs.recent.filter((open) => open !== key), key]

  if (tabs.keys.includes(key)) return { keys: tabs.keys, recent }

  const keys = [...tabs.keys, key]
  const evicted = new Set<string>()

  for (const candidate of keys) {
    if (keys.length - evicted.size <= limit) break
    if (candidate !== key && !held.has(tabTarget(candidate).path)) evicted.add(candidate)
  }

  return { keys: without(keys, evicted), recent: without(recent, evicted) }
}

/**
 * Открыть разницу файла. Вкладка разницы в проекте одна, как «Commit: файл» в WebStorm:
 * разница другого файла встаёт на её место в полосе, а не новой вкладкой - листая
 * изменения, полосу не засыпаешь. Нет такой вкладки - открывается как обычная.
 */
export const openDiffTab = (
  tabs: EditorTabs,
  path: string,
  options: { limit: number; held: ReadonlySet<string> },
): EditorTabs => {
  const key = diffTabKey(path)
  const previous = tabs.keys.find((open) => open !== key && tabTarget(open).kind === 'diff')

  if (previous === undefined) return openTab(tabs, key, options)

  const replace = (keys: readonly string[]) => keys.map((open) => (open === previous ? key : open))

  return openTab({ keys: replace(tabs.keys), recent: replace(tabs.recent) }, key, options)
}

/** Закрыть вкладки. Закрылась активная - активной становится выбранная до неё. */
export const closeTabs = (tabs: EditorTabs, closing: readonly string[]): EditorTabs => {
  const drop = new Set(closing)

  return { keys: without(tabs.keys, drop), recent: without(tabs.recent, drop) }
}

/**
 * Вкладки после переноса или переименования в дереве: вкладки самого файла и всего внутри
 * папки смотрят на новое место, порядок и выбор - прежние. Разница едет вместе с файлом.
 */
export const movedTabs = (tabs: EditorTabs, from: string, to: string): EditorTabs => {
  const move = (key: string) => {
    const { kind, path } = tabTarget(key)
    const moved = movedPathOf(path, from, to)

    return kind === 'diff' ? diffTabKey(moved) : moved
  }

  return { keys: tabs.keys.map(move), recent: tabs.recent.map(move) }
}

/** Ключи вкладок файла или всего внутри папки - закрыть их, когда её убрали в корзину. */
export const tabsUnder = (tabs: EditorTabs, root: string): string[] =>
  tabs.keys.filter((key) => isInsideAny(tabTarget(key).path, [root]))

/**
 * Файлы, которые уходят из середины совсем, если закрыть эти вкладки: ни вкладки файла,
 * ни разницы с ним не остаётся. Только про них есть смысл спрашивать о несохранённом -
 * файл, открытый ещё и другой вкладкой, своё несохранённое не теряет.
 */
export const pathsLeaving = (tabs: EditorTabs, closing: readonly string[]): string[] => {
  const drop = new Set(closing)
  const staying = new Set(
    tabs.keys.filter((key) => !drop.has(key)).map((key) => tabTarget(key).path),
  )

  return [
    ...new Set(closing.map((key) => tabTarget(key).path).filter((path) => !staying.has(path))),
  ]
}

/**
 * Вкладки из localStorage. Их пишет прошлый запуск или старая версия окна: строки, без
 * повторов, recent - только из открытых, и каждая открытая в нём есть (не выбиравшиеся -
 * в начале, как самые давние). Иначе закрытие активной вело бы в никуда.
 */
export const restoreTabs = (saved: unknown): EditorTabs => {
  const { keys, recent } = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<
    string,
    unknown
  >
  const strings = (value: unknown) =>
    Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
      : []
  const open = strings(keys)
  const chosen = strings(recent).filter((key) => open.includes(key))

  return { keys: open, recent: [...open.filter((key) => !chosen.includes(key)), ...chosen] }
}
