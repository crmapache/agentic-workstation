import { HOST_CHANNELS } from '@agentic-workstation/browser-protocol/protocol'
import type { HostChannel, SessionSummary } from '@agentic-workstation/browser-protocol/protocol'

import {
  emptyState,
  orphanTabs,
  agentTraces,
  restoredGroups,
  parseAgentState,
} from './agent-state.utils'
import type { AgentState } from './agent-state.utils'

const STATE_KEY = 'agentState'

/**
 * Сколько ждать IDE, которая пропала (упала, вышла, перезапускается). Dev перезапускается за
 * секунды; не вернулась за минуту - её вкладки агента закрываются, иначе оранжевая группа
 * осталась бы в Chrome навсегда.
 */
export const ORPHAN_MS = 60_000

/** Сколько после старта Chrome ловить группы агента, которые он восстанавливает не сразу. */
const STARTUP_SWEEP_MS = 60_000

/** Отпустить вкладки IDE, которых она больше не держит: отладчик и рамка уходят. */
export type ReleaseTabs = (channel: HostChannel, keep: ReadonlySet<number>) => Promise<void>

/**
 * Вкладки агента каждой IDE (ADR 0040), в storage.local: память сервис-воркера не переживает
 * его перезапуск, а Chrome - свой. IDE, которая вернулась, присылает сводку сессий - вкладки
 * агента прежних связей, которых в ней нет, закрываются (IDE упала и поднялась без них).
 * IDE, которая не вернулась за ORPHAN_MS, - тоже. После перезапуска Chrome его восстановленные
 * группы агента закрываются: их сессий больше нет ни в одной IDE.
 */
export class AgentTabs {
  private state: AgentState = emptyState()
  private readonly ready: Promise<void>
  /** Номер связи с IDE в этом сервис-воркере; вкладки из хранилища - нулевой связи. */
  private readonly generation: Record<HostChannel, number> = { installed: 0, dev: 0 }
  private readonly sweepPending = new Set<HostChannel>()
  private readonly timers = new Map<HostChannel, ReturnType<typeof setTimeout>>()
  private writing: Promise<void> = Promise.resolve()
  private startup: { titles: Set<string>; urls: Set<string>; until: number } | null = null

  constructor(private readonly release: ReleaseTabs) {
    this.ready = chrome.storage.local.get(STATE_KEY).then((stored) => {
      this.state = parseAgentState(stored[STATE_KEY])

      // IDE может и не прийти: тогда вкладки прошлых связей уходят по сроку.
      for (const channel of HOST_CHANNELS) {
        if (Object.keys(this.state[channel].tabs).length) this.scheduleOrphans(channel)
      }
    })
  }

  async opened(
    channel: HostChannel,
    tab: { tabId: number; url: string },
    groupId: number,
    groupTitle: string,
  ) {
    await this.ready
    this.state[channel].tabs[tab.tabId] = {
      groupId,
      url: tab.url,
      generation: this.generation[channel],
    }
    this.state[channel].groups[groupId] = groupTitle
    await this.save()
  }

  async closed(tabIds: readonly number[]) {
    await this.ready

    let changed = false

    for (const channel of HOST_CHANNELS) {
      for (const tabId of tabIds) {
        changed ||= tabId in this.state[channel].tabs
        delete this.state[channel].tabs[tabId]
      }
    }

    if (changed) await this.save()
  }

  async urlChanged(tabId: number, url: string) {
    await this.ready

    for (const channel of HOST_CHANNELS) {
      const tab = this.state[channel].tabs[tabId]

      if (tab && tab.url !== url) {
        tab.url = url
        await this.save()
      }
    }
  }

  /** IDE ответила на hello: ждать её больше не надо, первая сводка сессий решит судьбу вкладок. */
  welcome(channel: HostChannel): void {
    clearTimeout(this.timers.get(channel))
    this.timers.delete(channel)
    this.generation[channel] += 1
    this.sweepPending.add(channel)
  }

  /** IDE пропала: её вкладки ждут её ORPHAN_MS. */
  gone(channel: HostChannel): void {
    this.sweepPending.delete(channel)
    this.scheduleOrphans(channel)
  }

  /** Сводка сессий IDE. Первая после связи - список того, что IDE ещё держит. */
  async sessions(channel: HostChannel, sessions: readonly SessionSummary[]): Promise<void> {
    if (!this.sweepPending.delete(channel)) return

    await this.sweep(channel, new Set(sessions.flatMap((session) => session.tabIds)))
  }

  /** Chrome стартовал: группы агента прошлого запуска - закрыть, когда Chrome их вернёт. */
  async browserStarted(): Promise<void> {
    await this.ready

    const traces = agentTraces(this.state)

    this.state = emptyState()
    await this.save()

    if (!traces.titles.size) return

    this.startup = { ...traces, until: Date.now() + STARTUP_SWEEP_MS }
    await this.sweepRestored(await chrome.tabGroups.query({}))
  }

  /** Chrome вернул группу (восстановление идёт не сразу после старта). */
  async groupSeen(group: chrome.tabGroups.TabGroup): Promise<void> {
    if (this.startup && Date.now() < this.startup.until) await this.sweepRestored([group])
  }

  private async sweepRestored(groups: readonly chrome.tabGroups.TabGroup[]) {
    const traces = this.startup

    if (!traces) return

    for (const groupId of restoredGroups(groups, traces.titles)) {
      const tabs = await chrome.tabs.query({ groupId })
      const ids = (list: chrome.tabs.Tab[]) =>
        list.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]))
      const ours = tabs.filter((tab) => traces.urls.has(tab.url ?? tab.pendingUrl ?? ''))
      const [first, ...rest] = ids(tabs.filter((tab) => !ours.includes(tab)))

      await Promise.allSettled(ids(ours).map((tabId) => chrome.tabs.remove(tabId)))

      if (first !== undefined) await chrome.tabs.ungroup([first, ...rest]).catch(() => undefined)
    }
  }

  private scheduleOrphans(channel: HostChannel): void {
    clearTimeout(this.timers.get(channel))
    this.timers.set(
      channel,
      setTimeout(() => {
        this.timers.delete(channel)
        void this.sweep(channel, new Set(), Number.POSITIVE_INFINITY)
      }, ORPHAN_MS),
    )
  }

  /** Вкладки агента прежних связей, которых IDE не держит: свои в группе - закрыть, прочие - отпустить. */
  private async sweep(
    channel: HostChannel,
    held: ReadonlySet<number>,
    generation = this.generation[channel],
  ): Promise<void> {
    await this.ready

    const tabs = await chrome.tabs.query({})
    const live = new Map(
      tabs.flatMap((tab) => (tab.id === undefined ? [] : [[tab.id, tab.groupId]])),
    )
    const actions = orphanTabs(this.state[channel], held, generation, live)
    const close = actions.filter((action) => action.close).map((action) => action.tabId)

    await Promise.allSettled(close.map((tabId) => chrome.tabs.remove(tabId)))
    await this.release(channel, held)

    const own = this.state[channel]

    for (const id of Object.keys(own.tabs)) {
      if (!live.has(Number(id)) || actions.some((action) => action.tabId === Number(id))) {
        delete own.tabs[id]
      }
    }

    const groups = new Set(Object.values(own.tabs).map((tab) => tab.groupId))

    for (const id of Object.keys(own.groups)) if (!groups.has(Number(id))) delete own.groups[id]

    await this.save()
  }

  private save(): Promise<void> {
    this.writing = this.writing
      .then(() => chrome.storage.local.set({ [STATE_KEY]: this.state }))
      .catch(() => undefined)

    return this.writing
  }
}
