/**
 * Порядок полосы вкладок разговоров - чистые функции над списком. Список один на все
 * проекты (так он лежит на диске), а группа - разговор с его форками - всегда стоит
 * подряд: форк живёт рядом с тем, из чего вырос, и чужая вкладка внутрь группы не
 * встаёт. Голова группы - её первая вкладка: по ней полоса рисует зазор и цвет.
 */

/** Вкладка, как её видит порядок: своя группа, глубина форка и проект. */
export type TabRef = { id: string; groupId: string; depth: number; projectPath: string }

/**
 * Где стояла закрытая вкладка: группы своего проекта левее её группы и вкладки своей
 * группы левее неё. Место - соседями, а не номером: группы, закрытые и открытые с тех
 * пор, его не сдвигают.
 */
export type TabPlace = { groupsLeft: string[]; tabsLeft: string[] }

const inProject = <T extends TabRef>(tabs: readonly T[], projectPath: string) =>
  tabs.filter((tab) => tab.projectPath === projectPath)

const groupsOf = (tabs: readonly TabRef[]): string[] => [...new Set(tabs.map((tab) => tab.groupId))]

/**
 * Группы подряд, каждая собрана к своей первой вкладке. Чинит порядок, сложенный не
 * этими функциями (старый файл, правка руками), а правильный оставляет как есть.
 */
export const regroup = <T extends TabRef>(tabs: readonly T[]): T[] => {
  const groups = new Map<string, T[]>()

  for (const tab of tabs) groups.set(tab.groupId, [...(groups.get(tab.groupId) ?? []), tab])

  return [...groups.values()].flat()
}

/** Новая вкладка: форк - сразу за последней вкладкой своей группы, остальное - в конец. */
export const placeNew = <T extends TabRef>(tabs: readonly T[], tab: T): T[] => {
  const last = tabs.findLastIndex((item) => item.groupId === tab.groupId)

  return last < 0 ? [...tabs, tab] : [...tabs.slice(0, last + 1), tab, ...tabs.slice(last + 1)]
}

/**
 * Группа целиком - перед группой before, null - в конец. null в ответе - ничего не
 * сдвинулось, рассылать нечего.
 */
export const moveGroup = <T extends TabRef>(
  tabs: readonly T[],
  groupId: string,
  before: string | null,
): T[] | null => {
  const moving = tabs.filter((tab) => tab.groupId === groupId)

  if (moving.length === 0 || groupId === before) return null

  const rest = tabs.filter((tab) => tab.groupId !== groupId)
  const at = before === null ? -1 : rest.findIndex((tab) => tab.groupId === before)
  const index = at < 0 ? rest.length : at
  const next = [...rest.slice(0, index), ...moving, ...rest.slice(index)]

  return next.every((tab, place) => tabs[place] === tab) ? null : next
}

/**
 * Форк внутри своей группы - перед вкладкой before, null - в конец группы. Голова не
 * двигается и форк перед ней не встаёт: группа помечена головой. В группе из двух
 * переставлять нечего - там жест тащит всю группу (moveGroup).
 */
export const moveWithinGroup = <T extends TabRef>(
  tabs: readonly T[],
  id: string,
  before: string | null,
): T[] | null => {
  const moving = tabs.find((tab) => tab.id === id)

  if (!moving || id === before) return null

  const group = tabs.filter((tab) => tab.groupId === moving.groupId)

  if (group.length < 3 || group[0]?.id === id) return null

  const rest = group.filter((tab) => tab.id !== id)
  const at = before === null ? -1 : rest.findIndex((tab) => tab.id === before)
  const index = at < 0 ? rest.length : Math.max(1, at)
  const ordered = [...rest.slice(0, index), moving, ...rest.slice(index)]

  if (ordered.every((tab, place) => group[place] === tab)) return null

  const from = tabs.findIndex((tab) => tab.groupId === moving.groupId)

  return [...tabs.slice(0, from), ...ordered, ...tabs.slice(from + group.length)]
}

/**
 * Какую вкладку открыть, когда закрыли эту: соседа справа в том же проекте, а у
 * последней - соседа слева. Так глаз не ищет по полосе, куда попал. null - вкладок не
 * осталось.
 */
export const neighbourOf = (tabs: readonly TabRef[], id: string): string | null => {
  const closing = tabs.find((tab) => tab.id === id)

  if (!closing) return null

  const order = inProject(tabs, closing.projectPath)
  const at = order.findIndex((tab) => tab.id === id)

  return order[at + 1]?.id ?? order[at - 1]?.id ?? null
}

/** Где стоит вкладка - чтобы вернуть её туда же (TabPlace). */
export const placeOf = (tabs: readonly TabRef[], id: string): TabPlace => {
  const tab = tabs.find((item) => item.id === id)

  if (!tab) return { groupsLeft: [], tabsLeft: [] }

  const order = inProject(tabs, tab.projectPath)
  const groups = groupsOf(order)
  const group = order.filter((item) => item.groupId === tab.groupId)

  return {
    groupsLeft: groups.slice(0, groups.indexOf(tab.groupId)),
    tabsLeft: group.slice(0, group.indexOf(tab)).map((item) => item.id),
  }
}

/**
 * Вернуть закрытую вкладку на её место. Группа ещё стоит - вкладка встаёт в неё:
 * голова - в начало (форки под ней снова её), форк - за последним из прежних левых
 * соседей, а без них - сразу за головой. Группы нет - своей группой за последней из
 * прежних левых групп; нет и их - в начало проекта. Глубину и группу решает место.
 */
export const placeReopened = <T extends TabRef>(
  tabs: readonly T[],
  tab: T,
  place: TabPlace,
): T[] => {
  const groupStart = tabs.findIndex((item) => item.groupId === tab.groupId)

  if (groupStart >= 0) {
    const isHead = tab.groupId === tab.id
    const left = tabs.findLastIndex(
      (item) => item.groupId === tab.groupId && place.tabsLeft.includes(item.id),
    )
    const head = tabs.findIndex((item) => item.id === tab.groupId)
    const after = left >= 0 ? left : head
    const at = isHead || after < 0 ? groupStart : after + 1
    const placed = { ...tab, depth: isHead ? 0 : Math.max(tab.depth, 1) }

    return [...tabs.slice(0, at), placed, ...tabs.slice(at)]
  }

  const own = { ...tab, groupId: tab.id, depth: 0 }
  const groups = groupsOf(inProject(tabs, tab.projectPath))
  const lastLeft = groups.findLastIndex((groupId) => place.groupsLeft.includes(groupId))
  const before = groups[lastLeft + 1]
  const beforeAt = before === undefined ? -1 : tabs.findIndex((item) => item.groupId === before)

  if (beforeAt >= 0) return [...tabs.slice(0, beforeAt), own, ...tabs.slice(beforeAt)]

  const projectEnd = tabs.findLastIndex((item) => item.projectPath === tab.projectPath)

  return [...tabs.slice(0, projectEnd + 1), own, ...tabs.slice(projectEnd + 1)]
}
