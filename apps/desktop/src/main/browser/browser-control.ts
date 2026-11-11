import type { BrowserMethod, BrowserMethods } from '@agentic-workstation/browser-protocol/protocol'

import { BrowserError } from './browser-error'
import type { HubPort } from './browser-hub'
import type { HeldTab, SessionEnd, BrowserSession, BrowserSessions } from './browser-sessions'
import type { LoadWaitList } from './load-waits'
import { Page } from './page'

export type ControlDeps = {
  hub: HubPort
  sessions: BrowserSessions
  loads: LoadWaitList
  now: () => number
  pushSummaries: (profileKey: string) => void
}

/** CDP-домены, без которых не работают снимок, консоль и ожидание загрузки. */
const DOMAINS = ['Page.enable', 'Runtime.enable', 'Log.enable']

const offLimits = (tab: HeldTab, reason: string) =>
  `${reason} Chrome keeps extensions out of chrome:// pages, the Chrome Web Store and file: pages without file access. ${
    tab.owned ? 'The tab stays in your group: close it with close_tab.' : 'The tab was released.'
  } Open another tab or take a different one.`

/**
 * Отладчик и рамка во вкладках сессий (ADR 0040): подключить на время работы, отпустить,
 * закончить сессию, сверить вкладки с вернувшимся профилем. Реестр сессий - BrowserSessions,
 * связь с Chrome - здесь.
 */
export class TabControl {
  constructor(private readonly deps: ControlDeps) {}

  /** Вкладка для вызова инструмента: отладчик подключается, если его ещё нет. */
  async attach(session: BrowserSession, tab: HeldTab, signal?: AbortSignal): Promise<Page> {
    const page = new Page(this.deps.hub, tab, this.deps.loads, signal, () =>
      this.connect(session, tab, signal),
    )

    tab.lastUsed = this.deps.now()

    if (!tab.attached) await this.connect(session, tab, signal)

    return page
  }

  /** Взятую вкладку отпустить: отладчик и рамка уходят, вкладка остаётся человеку. */
  async letGo(tab: HeldTab): Promise<void> {
    tab.attached = false
    await this.quiet(tab.profileKey, 'debugger.detach', { tabId: tab.tabId })
    await this.quiet(tab.profileKey, 'overlay.frame', { tabId: tab.tabId, on: false })
  }

  /**
   * Конец сессии. Свои вкладки закрываются, только если они всё ещё в группе, где агент их
   * открыл: вкладку, которую человек вытащил из группы, он оставил себе - её, как и взятые по
   * ссылке, отпускают. Чужие вкладки, которые человек перетащил в группы сессии, выходят из
   * них. Профилей может быть несколько - у каждого свой список вкладок.
   */
  async finish(end: SessionEnd): Promise<{ closed: number; released: number }> {
    const profiles = [...new Set(end.owned.map((tab) => tab.profileKey))]
    const listings = new Map(
      await Promise.all(
        profiles.map(
          async (profileKey) =>
            [
              profileKey,
              await this.deps.hub.request(profileKey, 'tabs.list', {}).catch(() => null),
            ] as const,
        ),
      ),
    )
    const groupNow = (tab: HeldTab) =>
      listings.get(tab.profileKey)?.tabs.find((item) => item.tabId === tab.tabId)?.groupId
    const close = end.owned.filter((tab) => tab.groupId >= 0 && groupNow(tab) === tab.groupId)
    const release = [...end.taken, ...end.owned.filter((tab) => !close.includes(tab))]

    for (const profileKey of profiles) {
      const closing = close.filter((tab) => tab.profileKey === profileKey)
      const groups = new Set(
        end.owned.filter((tab) => tab.profileKey === profileKey).map((tab) => tab.groupId),
      )
      const strangers = (listings.get(profileKey)?.tabs ?? []).filter(
        (item) => groups.has(item.groupId) && !closing.some((tab) => tab.tabId === item.tabId),
      )

      if (closing.length) {
        await this.quiet(profileKey, 'tabs.close', { tabIds: closing.map((tab) => tab.tabId) })
      }

      if (strangers.length) {
        await this.quiet(profileKey, 'tabs.ungroup', {
          tabIds: strangers.map((item) => item.tabId),
        })
      }
    }

    for (const tab of release) await this.letGo(tab)

    for (const profileKey of new Set([...end.owned, ...end.taken].map((tab) => tab.profileKey))) {
      this.deps.pushSummaries(profileKey)
    }

    return { closed: close.length, released: release.length }
  }

  /**
   * Профиль вернулся (новый hello): отладчики прежней связи сняты, а вкладки надо сверить.
   * Chrome перезапустился (другая метка запуска) - id вкладок розданы заново, прежние
   * вкладки не наши. Иначе живые остаются, закрытые за это время уходят, пропавшая группа
   * забывается. Сводка уходит всегда, даже пустая: по ней расширение закрывает вкладки агента,
   * о которых IDE не знает (IDE упала и поднялась заново).
   */
  async reconcile(profileKey: string): Promise<void> {
    const held = this.deps.sessions.heldIn(profileKey)
    const launch = this.deps.hub.profile(profileKey)?.launch ?? ''

    for (const { tab } of held) tab.attached = false

    const listing = await this.deps.hub.request(profileKey, 'tabs.list', {}).catch(() => null)

    if (listing) {
      const alive = new Set(listing.tabs.map((tab) => tab.tabId))
      const groups = new Set(listing.groups.map((group) => group.groupId))

      for (const { session, tab } of held) {
        if (tab.launch === launch && alive.has(tab.tabId)) tab.offline = false
        else this.deps.sessions.drop(session, tab.key)
      }

      for (const session of this.deps.sessions.all()) {
        const { group } = session

        if (group?.profileKey === profileKey && !groups.has(group.groupId)) session.group = null
      }
    }

    this.deps.pushSummaries(profileKey)
  }

  private async connect(
    session: BrowserSession,
    tab: HeldTab,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const { hub } = this.deps

    try {
      await hub.request(tab.profileKey, 'debugger.attach', { tabId: tab.tabId }, { signal })
    } catch (error) {
      if (error instanceof BrowserError && error.code === 'attach-failed') {
        throw await this.offLimits(session, tab, error.message)
      }

      throw error
    }

    tab.attached = true
    tab.offline = false

    for (const method of DOMAINS) await this.cdpQuiet(tab, method)

    // Фоновая вкладка считает себя в фокусе: поля принимают ввод, как у человека.
    await this.cdpQuiet(tab, 'Emulation.setFocusEmulationEnabled', { enabled: true })
    await this.quiet(tab.profileKey, 'overlay.frame', { tabId: tab.tabId, on: true })
  }

  /**
   * К вкладке нельзя подключиться (магазин расширений, chrome://, file: без доступа): она не
   * должна застрять текущей. Взятая - отпускается, своя - остаётся в группе до finish.
   */
  private async offLimits(
    session: BrowserSession,
    tab: HeldTab,
    reason: string,
  ): Promise<BrowserError> {
    this.deps.sessions.moveCurrentFrom(session, tab.key)

    if (!tab.owned) {
      this.deps.sessions.drop(session, tab.key)
      await this.letGo(tab)
      this.deps.pushSummaries(tab.profileKey)
    }

    return new BrowserError('attach-failed', offLimits(tab, reason))
  }

  private cdpQuiet(tab: HeldTab, method: string, params: Record<string, unknown> = {}) {
    return this.quiet(tab.profileKey, 'cdp', { tabId: tab.tabId, method, params })
  }

  /** Запрос, отказ которого ничего не меняет: вкладку уже закрыли, профиль отключился. */
  private async quiet<M extends BrowserMethod>(
    profileKey: string,
    method: M,
    params: BrowserMethods[M]['params'],
  ): Promise<void> {
    await this.deps.hub.request(profileKey, method, params).catch(() => undefined)
  }
}
