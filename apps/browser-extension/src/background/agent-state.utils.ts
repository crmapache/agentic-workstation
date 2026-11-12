import type { HostChannel } from '@agentic-workstation/browser-protocol/protocol'

/**
 * Что расширение помнит о работе одной IDE (ADR 0040), чистыми данными - решения о том, что
 * закрыть, принимают функции ниже, их держит тест.
 */

/** Своя вкладка агента: группа, в которой её открыли, последний адрес и номер связи. */
export type OwnTab = { groupId: number; url: string; generation: number }

export type ChannelState = {
  /** Вкладки, открытые агентом этой IDE, по id. */
  tabs: Record<string, OwnTab>
  /** Группы агента этой IDE: id → имя. По имени узнаются группы, восстановленные Chrome. */
  groups: Record<string, string>
}

export type AgentState = Record<HostChannel, ChannelState>

export const emptyChannel = (): ChannelState => ({ tabs: {}, groups: {} })

export const emptyState = (): AgentState => ({ installed: emptyChannel(), dev: emptyChannel() })

/** Состояние из storage.local: чужое или битое - пустое, а не исключение в сервис-воркере. */
export const parseAgentState = (value: unknown): AgentState => {
  const state = emptyState()

  if (typeof value !== 'object' || value === null) return state

  for (const channel of ['installed', 'dev'] as const) {
    const stored = (value as Record<string, unknown>)[channel] as Partial<ChannelState> | undefined

    if (stored && typeof stored === 'object') {
      state[channel] = {
        tabs: typeof stored.tabs === 'object' && stored.tabs ? { ...stored.tabs } : {},
        groups: typeof stored.groups === 'object' && stored.groups ? { ...stored.groups } : {},
      }
    }
  }

  return state
}

/** Что сделать с вкладкой агента, которую IDE больше не держит. */
export type OrphanAction = { tabId: number; close: boolean }

/**
 * Вкладки агента, о которых IDE не знает: из прежних связей (generation меньше нынешней) и не
 * в сводке сессий. Вкладка ещё в своей группе - закрыть; человек вытащил её из группы - она
 * его, только забыть. live - вкладки Chrome сейчас (id → группа), пропавшие уже закрыты.
 */
export const orphanTabs = (
  state: ChannelState,
  held: ReadonlySet<number>,
  generation: number,
  live: ReadonlyMap<number, number>,
): OrphanAction[] =>
  Object.entries(state.tabs).flatMap(([id, tab]) => {
    const tabId = Number(id)

    if (tab.generation >= generation || held.has(tabId) || !live.has(tabId)) return []

    return [{ tabId, close: live.get(tabId) === tab.groupId }]
  })

/**
 * Группы агента, которые Chrome восстановил после перезапуска: оранжевые, с именем одной из
 * групп агента прошлого запуска. Их вкладки - закрыть, если адрес был у вкладки агента, иначе
 * вывести из группы: человек мог перетащить туда свою.
 */
export const restoredGroups = (
  groups: readonly { id: number; title?: string | undefined; color: string }[],
  titles: ReadonlySet<string>,
): number[] =>
  groups
    .filter((group) => group.color === 'orange' && titles.has(group.title ?? ''))
    .map((group) => group.id)

/** Имена групп и адреса вкладок агента из состояния - чтобы узнать их после перезапуска Chrome. */
export const agentTraces = (state: AgentState): { titles: Set<string>; urls: Set<string> } => {
  const channels = Object.values(state)

  return {
    titles: new Set(channels.flatMap((channel) => Object.values(channel.groups))),
    urls: new Set(channels.flatMap((channel) => Object.values(channel.tabs).map((tab) => tab.url))),
  }
}
