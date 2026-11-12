import type { Scenario, ScenarioScope } from '@shared/scenarios'

/**
 * Две полки строками в порядке, который выбрал человек, и место, куда легла бы несомая строка
 * (arrange.ts в ACC). Отдельно от экрана и чисто: здесь перетаскивание ломается незаметно -
 * строка перепрыгивает место, не встаёт первой на соседнюю полку, мечется между полками при
 * неподвижной руке. Каждая такая беда - сравнение двух чисел, а числа тест держит.
 */

/** Строки каждой полки сверху вниз - ключами строк (rowKey). */
export type Arrangement = Record<ScenarioScope, string[]>

/** Куда встаёт строка: полка и сколько ДРУГИХ строк этой полки стоит выше неё. */
export type ShelfPlace = { shelf: ScenarioScope; index: number }

/** Коробка строки, как она лежит в раскладке (сверху вниз от начала полок). */
export type RowBox = { key: string; shelf: ScenarioScope; top: number; height: number }

/** Что сказать главному процессу после отпускания: какой, откуда, куда и перед кем (пусто - в конец). */
export type ShelfMove = { id: string; from: ScenarioScope; to: ScenarioScope; before: string }

/**
 * Имя строки на время перетаскивания: полка, с которой прочитана, и id. Один id сталкивается,
 * когда он есть на обеих полках (проектный вернулся с checkout рядом с личной копией).
 */
export const rowKey = (scenario: Pick<Scenario, 'id' | 'scope'>): string =>
  `${scenario.scope}:${scenario.id}`

/** id из ключа строки - всё после первого двоеточия: в имени полки двоеточий нет. */
export const idOfRow = (key: string): string => key.slice(key.indexOf(':') + 1)

/** Полки, как их прислал главный процесс: порядок каждой - прочитанный с диска. */
export const arrangementOf = (
  scenarios: readonly Pick<Scenario, 'id' | 'scope'>[],
): Arrangement => ({
  project: scenarios.filter((one) => one.scope === 'project').map(rowKey),
  user: scenarios.filter((one) => one.scope === 'user').map(rowKey),
})

/** На какой полке строка; null - ни на какой. */
export const shelfOfRow = (arrangement: Arrangement, key: string): ScenarioScope | null => {
  if (arrangement.project.includes(key)) return 'project'

  return arrangement.user.includes(key) ? 'user' : null
}

/** Где строка стоит сейчас - в терминах ShelfPlace. */
export const placeOfRow = (arrangement: Arrangement, key: string): ShelfPlace | null => {
  const shelf = shelfOfRow(arrangement, key)

  return shelf ? { shelf, index: arrangement[shelf].indexOf(key) } : null
}

/** Полки, где строку вынули оттуда, где она стояла, и поставили в place. */
export const placed = (arrangement: Arrangement, key: string, place: ShelfPlace): Arrangement => {
  const without: Arrangement = {
    project: arrangement.project.filter((one) => one !== key),
    user: arrangement.user.filter((one) => one !== key),
  }
  const rows = [...without[place.shelf]]

  rows.splice(Math.min(Math.max(place.index, 0), rows.length), 0, key)

  return { ...without, [place.shelf]: rows }
}

/**
 * Перенос для главного процесса; null - строку положили туда же. Сосед, а не номер: главный
 * процесс ставит её среди того, что на ДИСКЕ, а второе окно могло добавить строку, которой
 * это окно ещё не рисовало.
 */
export const placement = (start: Arrangement, end: Arrangement, key: string): ShelfMove | null => {
  const from = shelfOfRow(start, key)
  const to = shelfOfRow(end, key)

  if (!from || !to) return null
  if (from === to && start[from].join('\n') === end[to].join('\n')) return null

  const rows = end[to]
  const next = rows[rows.indexOf(key) + 1]

  return { id: idOfRow(key), from, to, before: next ? idOfRow(next) : '' }
}

/**
 * Куда строку можно положить. Проектная полка - только если есть папка проекта, и ни одна -
 * если на ней уже лежит сценарий с тем же id: главный процесс откажет, а полка, которая берёт
 * строку и через миг отдаёт обратно, хуже полки, которая не берёт.
 */
export const shelvesOpen = (
  arrangement: Arrangement,
  key: string,
  canShare: boolean,
): Record<ScenarioScope, boolean> => {
  const id = idOfRow(key)
  const twin = (shelf: ScenarioScope) =>
    arrangement[shelf].some((one) => one !== key && idOfRow(one) === id)

  return { project: canShare && !twin('project'), user: !twin('user') }
}

/** Есть ли строке куда двигаться: сосед на своей полке или открытая соседняя. Нет - нет и ручки. */
export const isMovable = (arrangement: Arrangement, key: string, canShare: boolean): boolean => {
  const shelf = shelfOfRow(arrangement, key)

  if (!shelf) return false

  const other: ScenarioScope = shelf === 'project' ? 'user' : 'project'

  return arrangement[shelf].length > 1 || shelvesOpen(arrangement, key, canShare)[other]
}

/** Что известно о несомой карточке и о раскладке, снятой в начале жеста. */
export type LandingInput = {
  key: string
  /** Полка, с которой строку подняли: туда она остаётся, если соседняя её не берёт. */
  from: ScenarioScope
  /** Карточка, где она нарисована сейчас (под рукой). */
  top: number
  bottom: number
  /** Верх собственного места строки: выше него ведёт верхний край, ниже - нижний. */
  origin: number
  rows: readonly RowBox[]
  /** Граница полок - середина заголовка второй; null - переходить некуда. */
  boundary: number | null
  open: Record<ScenarioScope, boolean>
}

/**
 * Куда легла бы строка сейчас: полку решает СЕРЕДИНА карточки, место на полке - её ПЕРЕДНИЙ
 * край. Середина не переключается при переезде, поэтому строка не прыгает между полками при
 * неподвижной руке; а место - краем, потому что строки разной высоты, и у высокой середина
 * далеко от руки (правило списков snakein). Раскладка - снятая в начале жеста, поэтому
 * соседи, уступившие место на экране, решение не двигают.
 */
export const landing = ({
  key,
  from,
  top,
  bottom,
  origin,
  rows,
  boundary,
  open,
}: LandingInput): ShelfPlace => {
  const edge = top < origin ? top : bottom
  const middle = (top + bottom) / 2
  const across: ScenarioScope = boundary === null ? from : middle < boundary ? 'project' : 'user'
  const shelf = open[across] ? across : from
  const index = rows.filter(
    (row) => row.shelf === shelf && row.key !== key && row.top + row.height / 2 < edge,
  ).length

  return { shelf, index }
}

/**
 * Одно нажатие стрелки: следующее место ниже или выше, через границу на соседнюю полку, когда
 * на своей мест больше нет, и то же место, когда двигаться некуда.
 */
export const stepped = (
  arrangement: Arrangement,
  key: string,
  at: ShelfPlace,
  down: boolean,
  open: Record<ScenarioScope, boolean>,
): ShelfPlace => {
  const others = (shelf: ScenarioScope) => arrangement[shelf].filter((one) => one !== key).length

  if (down) {
    if (at.index < others(at.shelf)) return { shelf: at.shelf, index: at.index + 1 }
    if (at.shelf === 'project' && open.user) return { shelf: 'user', index: 0 }
  } else {
    if (at.index > 0) return { shelf: at.shelf, index: at.index - 1 }
    if (at.shelf === 'user' && open.project) return { shelf: 'project', index: others('project') }
  }

  return at
}

/** Что стоит в списке полки: строка (несомая - спрятанной) или место, куда она ляжет. */
export type ShelfEntry = { kind: 'row'; key: string; hidden: boolean } | { kind: 'slot' }

/**
 * Список полки в порядке экрана. Несомая строка стоит на своём месте спрятанной: её узел не
 * вынимают и не переносят в другой список - жест держится за него, и без него конец жеста
 * (dragend) не дошёл бы. Место под неё - перед slot-й из остальных строк, за краем - в конце.
 */
export const shelfEntries = (
  rows: readonly string[],
  carried: string | null,
  slot: number | null,
): ShelfEntry[] => {
  const entries: ShelfEntry[] = []
  let seen = 0

  for (const key of rows) {
    if (key === carried) {
      entries.push({ kind: 'row', key, hidden: true })
      continue
    }

    if (seen === slot) entries.push({ kind: 'slot' })

    entries.push({ kind: 'row', key, hidden: false })
    seen += 1
  }

  if (slot !== null && slot >= seen) entries.push({ kind: 'slot' })

  return entries
}
