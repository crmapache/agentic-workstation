import type {
  TabInfo,
  GroupInfo,
  BrowserMethods,
} from '@agentic-workstation/browser-protocol/protocol'

import { MethodError } from './method-error'

/** Цвет группы агента - акцентный оранжевый проекта, ближайший из цветов групп Chrome. */
const GROUP_COLOR = 'orange'

/** Пустая вкладка агента: about:blank, а не новая вкладка Chrome - к chrome:// отладчик не подключить. */
const BLANK = 'about:blank'

export const tabInfo = (tab: chrome.tabs.Tab): TabInfo => ({
  tabId: tab.id ?? -1,
  windowId: tab.windowId,
  index: tab.index,
  title: tab.title ?? '',
  url: tab.url ?? tab.pendingUrl ?? '',
  active: tab.active,
  groupId: tab.groupId,
  status: tab.status === 'loading' || tab.status === 'unloaded' ? tab.status : 'complete',
})

const groupInfo = (group: chrome.tabGroups.TabGroup): GroupInfo => ({
  groupId: group.id,
  windowId: group.windowId,
  title: group.title ?? '',
  color: group.color,
  collapsed: group.collapsed,
})

export const listTabs = async (): Promise<BrowserMethods['tabs.list']['result']> => {
  const [tabs, groups, focused] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
    chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null),
  ])

  return {
    tabs: tabs.filter((tab) => tab.id !== undefined).map(tabInfo),
    groups: groups.map(groupInfo),
    focusedWindowId: focused?.id ?? null,
  }
}

export const getTab = async (tabId: number): Promise<TabInfo | null> =>
  chrome.tabs.get(tabId).then(tabInfo, () => null)

/** Живая группа или null: человек мог закрыть её целиком. */
const liveGroup = (groupId: number | null): Promise<chrome.tabGroups.TabGroup | null> =>
  groupId === null || groupId < 0
    ? Promise.resolve(null)
    : chrome.tabGroups.get(groupId).catch(() => null)

/**
 * Окно, где человек был последним (обычное, не всплывающее). Окон нет вовсе - новое, без
 * фокуса: агент не отнимает у человека клавиатуру.
 */
const targetWindow = async (url: string): Promise<{ windowId: number; tab?: chrome.tabs.Tab }> => {
  const last = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null)

  if (last?.id !== undefined) return { windowId: last.id }

  const created = await chrome.windows.create({ url, focused: false })
  const tab = created?.tabs?.[0]

  if (created?.id === undefined || !tab)
    throw new MethodError('no-window', 'Chrome has no window to open a tab in.')

  return { windowId: created.id, tab }
}

/**
 * Новая вкладка агента: неактивная, чтобы фокус и текущая вкладка человека остались на месте,
 * в группе сессии. Группы нет (первая вкладка или человек её закрыл) - новая оранжевая группа
 * в окне, где человек был последним.
 */
export const openTab = async ({
  url,
  groupId,
  groupTitle,
}: BrowserMethods['tabs.open']['params']): Promise<BrowserMethods['tabs.open']['result']> => {
  const target = url.trim() || BLANK
  const group = await liveGroup(groupId)
  const placed = group ? { windowId: group.windowId } : await targetWindow(target)
  const tab =
    placed.tab ??
    (await chrome.tabs.create({ windowId: placed.windowId, url: target, active: false }))

  if (tab.id === undefined) throw new MethodError('failed', 'Chrome did not create the tab.')

  const nextGroup = group
    ? await chrome.tabs.group({ groupId: group.id, tabIds: [tab.id] })
    : await chrome.tabs.group({ tabIds: [tab.id], createProperties: { windowId: placed.windowId } })

  if (!group) {
    await chrome.tabGroups.update(nextGroup, {
      title: groupTitle,
      color: GROUP_COLOR,
      collapsed: false,
    })
  }

  return { tab: tabInfo(await chrome.tabs.get(tab.id)), groupId: nextGroup }
}

/** Закрыть вкладки; уже закрытые не считаются ошибкой. */
export const closeTabs = async (tabIds: number[]): Promise<null> => {
  await Promise.allSettled(tabIds.map((tabId) => chrome.tabs.remove(tabId)))

  return null
}

export const ungroupTabs = async (tabIds: number[]): Promise<null> => {
  const [first, ...rest] = tabIds

  if (first !== undefined) await chrome.tabs.ungroup([first, ...rest]).catch(() => undefined)

  return null
}
