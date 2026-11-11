import { basename } from 'node:path'

import { sameTabTitle } from '@agentic-workstation/browser-protocol/tab-reference'

import { TabControl } from './browser-control'
import { BrowserError } from './browser-error'
import { handleBrowserEvent } from './browser-events'
import type { EventContext } from './browser-events'
import type { HubPort, BrowserProfile } from './browser-hub'
import { sessionIdOf, SessionLaunches, SESSION_GRACE_MS } from './browser-launches'
import { BrowserSessions } from './browser-sessions'
import type { HeldTab, BrowserSession } from './browser-sessions'
import type { Motion } from './human-motion'
import { HUMAN_MOTION } from './human-motion'
import { LoadWaitList } from './load-waits'
import type { Page } from './page'

/**
 * Чей вызов: процесс разговора (ключ запуска шлюза), его разговор, проект - для имени группы
 * - и папка, где процесс работает (проект или worktree сценария): файлы с диска инструменты
 * берут только из неё.
 */
export type AgentCall = {
  launchId: string | null
  conversationId: string | null
  projectPath: string | null
  workDir: string | null
  signal?: AbortSignal | undefined
}

/** Какую вкладку назвала модель: ссылка (профиль, метка запуска, заголовок) или номер. */
export type WantedTab = {
  profileKey: string | null
  tabId: number
  launch: string | null
  title: string | null
}

/** Отладчик вкладки, которую агент не трогал минуту, отключается (плашка Chrome уходит). */
export const IDLE_DETACH_MS = 60_000
const IDLE_CHECK_MS = 15_000

/** Сколько выход IDE ждёт, пока расширение закроет вкладки агентов. */
const DISPOSE_WAIT_MS = 3000

const ENDED = 'This conversation process has ended.'

/**
 * Браузер для агентов (ADR 0040): сессия на разговор, отладчик - на время работы, события
 * расширения (человек закрыл вкладку или группу, нажал Stop, отключил отладчик). Инструменты
 * (connectors/kinds/browser) зовут его методы.
 */
export class BrowserAgent {
  readonly sessions = new BrowserSessions()
  private readonly loads = new LoadWaitList()
  /** Что сказать модели на следующий вызов вместо ответа: человек остановил сессию. */
  private readonly notices = new Map<string, string>()
  private readonly launches: SessionLaunches
  private readonly control: TabControl
  private readonly unsubscribe: (() => void)[]
  private readonly idleTimer: ReturnType<typeof setInterval>

  constructor(
    readonly hub: HubPort,
    private readonly now: () => number = Date.now,
    graceMs = SESSION_GRACE_MS,
    motion: Motion = HUMAN_MOTION,
  ) {
    const pushSummaries = (profileKey: string) => this.pushSummaries(profileKey)
    const context: EventContext = {
      hub,
      sessions: this.sessions,
      loads: this.loads,
      notices: this.notices,
      now,
      finish: (sessionId) => this.finish(sessionId),
      pushSummaries,
    }

    this.control = new TabControl({
      hub,
      sessions: this.sessions,
      loads: this.loads,
      now,
      pushSummaries,
      motion,
    })
    this.launches = new SessionLaunches((sessionId) => this.expire(sessionId), graceMs)
    this.unsubscribe = [
      hub.onEvent((profileKey, event) => handleBrowserEvent(context, profileKey, event)),
      hub.onLink((profileKey, up) => {
        if (up) void this.control.reconcile(profileKey)
        else this.sessions.profileOffline(profileKey)
      }),
    ]
    this.idleTimer = setInterval(() => void this.detachIdle(), IDLE_CHECK_MS)
    this.idleTimer.unref()
  }

  profiles(): BrowserProfile[] {
    return this.hub.profiles()
  }

  /**
   * Сессия вызова. Процесс уже кончился - отказ: его вызов не должен открыть вкладку, которую
   * некому закрыть. Остановленная человеком - один раз отказ с объяснением, потом снова можно.
   */
  session(call: AgentCall): BrowserSession {
    if (this.launches.isReleased(call.launchId)) throw new BrowserError('aborted', ENDED)

    const id = sessionIdOf(call)
    const notice = this.notices.get(id)

    if (notice) {
      this.notices.delete(id)
      throw new BrowserError('aborted', notice)
    }

    this.launches.touch(call)

    const project = call.projectPath ? basename(call.projectPath) : 'Agent'

    return this.sessions.ensure(id, `AW · ${project}`)
  }

  /** Заметки для модели, накопленные сессией вызова: уходят с ответом один раз. */
  takeNotes(call: AgentCall): string[] {
    return this.sessions.get(sessionIdOf(call))?.notes.splice(0) ?? []
  }

  /**
   * Профиль по ключу или имени; не задан - профиль группы сессии или единственный. Имя у двух
   * профилей одно («Google Chrome» в двух окнах) - отказ со списком ключей, а не первый попавшийся.
   */
  pickProfile(session: BrowserSession, wanted: string | undefined): string {
    const profiles = this.hub.profiles()

    if (wanted) {
      const lower = wanted.toLowerCase()
      const byKey = profiles.find((profile) => profile.key === wanted)
      const byName = profiles.filter((profile) => profile.name.toLowerCase() === lower)

      if (byKey) return byKey.key

      if (byName.length > 1) {
        throw new BrowserError(
          'bad-request',
          `Several connected Chrome profiles are named "${wanted}"; pass the profile key instead. ${listProfiles(profiles)}`,
        )
      }

      const [found] = byName

      if (!found)
        throw new BrowserError(
          'profile-offline',
          `Chrome profile "${wanted}" is not connected. ${listProfiles(profiles)}`,
        )

      return found.key
    }

    if (session.group && profiles.some((profile) => profile.key === session.group?.profileKey)) {
      return session.group.profileKey
    }

    const [only, ...rest] = profiles

    if (!only) throw new BrowserError('profile-offline', NO_PROFILE)

    if (rest.length) {
      throw new BrowserError(
        'bad-request',
        `Several Chrome profiles are connected; pass "profile". ${listProfiles(profiles)}`,
      )
    }

    return only.key
  }

  /**
   * Новая неактивная вкладка в группе сессии; становится текущей. Открытие не отменяется по
   * сигналу посреди пути: вкладку, которую Chrome уже открыл, некому было бы закрыть. Отмену
   * и конец сессии проверяет ответ - тогда новая вкладка сразу закрывается.
   */
  async open(call: AgentCall, url: string, profile?: string): Promise<Page> {
    const session = this.session(call)
    const profileKey = this.pickProfile(session, profile)
    const group = session.group?.profileKey === profileKey ? session.group.groupId : null
    const opened = await this.hub.request(profileKey, 'tabs.open', {
      url,
      groupId: group,
      groupTitle: session.title,
    })

    if (!this.isLive(session) || call.signal?.aborted) {
      await this.hub
        .request(profileKey, 'tabs.close', { tabIds: [opened.tab.tabId] })
        .catch(() => undefined)
      throw new BrowserError('aborted', 'The call was cancelled.')
    }

    session.group = { profileKey, groupId: opened.groupId }

    const tab = this.hold(session, profileKey, opened.tab.tabId, true, opened.tab.url)

    if (!tab)
      throw new BrowserError('failed', 'The new tab is already held by another conversation.')

    tab.groupId = opened.groupId

    this.pushSummaries(profileKey)

    const page = await this.control.attach(session, tab, call.signal)

    if (url) await page.settle(url, 15_000)

    return page
  }

  /**
   * Взять вкладку человека по ссылке: остаётся на своём месте, получает рамку. Ссылка из
   * прежнего запуска Chrome (другая метка) не принимается: id вкладок после перезапуска
   * розданы заново. Ссылку без метки сверяет заголовок, если он есть.
   */
  async take(call: AgentCall, wanted: WantedTab & { profileKey: string }): Promise<Page> {
    const session = this.session(call)
    const { profileKey, tabId } = wanted
    const profile = this.hub.profile(profileKey)

    if (!profile) {
      throw new BrowserError(
        'profile-offline',
        `Chrome profile ${profileKey} is not connected. ${listProfiles(this.hub.profiles())}`,
      )
    }

    if (wanted.launch && profile.launch && wanted.launch !== profile.launch) {
      throw new BrowserError('no-tab', staleReference(tabId))
    }

    const info = await this.hub.request(profileKey, 'tabs.get', { tabId }, { signal: call.signal })

    if (!info) throw new BrowserError('no-tab', `Tab ${tabId} is not open in that Chrome profile.`)

    if (!wanted.launch && wanted.title && !sameTabTitle(wanted.title, info.title)) {
      throw new BrowserError('no-tab', otherTitle(tabId, info.title, wanted.title))
    }

    if (!this.isLive(session)) throw new BrowserError('aborted', 'The call was cancelled.')

    const tab = this.hold(session, profileKey, tabId, false, info.url)

    if (!tab) {
      throw new BrowserError(
        'bad-request',
        'Another conversation is working in this tab right now.',
      )
    }

    this.pushSummaries(profileKey)

    const page = await this.control.attach(session, tab, call.signal)

    if (!this.isLive(session)) {
      await this.control.letGo(tab)
      throw new BrowserError('aborted', 'The call was cancelled.')
    }

    return page
  }

  /**
   * Вкладка для действия: текущая сессии или названная. Вкладку, которую сессия ещё не держит,
   * берёт сама - ссылка от человека уже разрешение.
   */
  async page(call: AgentCall, wanted?: WantedTab): Promise<Page> {
    const session = this.session(call)
    const held = this.heldTab(session, wanted)

    if (held) {
      session.current = held.key

      return this.control.attach(session, held, call.signal)
    }

    if (!wanted) throw new BrowserError('bad-request', NO_TAB)

    const profileKey = wanted.profileKey ?? this.pickProfile(session, undefined)

    return this.take(call, { ...wanted, profileKey })
  }

  /**
   * Закрыть вкладку сессии (свою или взятую). Отладчик не нужен: вкладку, к которой Chrome не
   * пускает расширения, тоже можно закрыть.
   */
  async closeTab(call: AgentCall, wanted?: WantedTab): Promise<HeldTab> {
    const session = this.session(call)
    const tab = this.heldTab(session, wanted)

    if (!tab) {
      throw new BrowserError(
        'bad-request',
        wanted ? `You don't hold tab ${wanted.tabId}: take it first.` : NO_TAB,
      )
    }

    this.sessions.drop(session, tab.key)
    await this.hub.request(tab.profileKey, 'tabs.close', { tabIds: [tab.tabId] })
    this.pushSummaries(tab.profileKey)

    return tab
  }

  /** Конец работы сессии (TabControl.finish); сессии нет - ничего. */
  async finish(sessionId: string): Promise<{ closed: number; released: number }> {
    const end = this.sessions.end(sessionId)

    this.launches.forget(sessionId)

    return end ? this.control.finish(end) : { closed: 0, released: 0 }
  }

  /** Инструмент finish: сессия разговора этого вызова. */
  finishCall(call: AgentCall): Promise<{ closed: number; released: number }> {
    return this.finish(sessionIdOf(call))
  }

  /** Процесс разговора кончился: сессия ждёт его следующий процесс (SessionLaunches). */
  release(launch: { id: string; conversationId: string | null }): void {
    this.launches.release(launch)
  }

  /** Разговор закрыт насовсем (закрыли вкладку): его вкладки - как по finish, сразу. */
  endConversation(conversationId: string): void {
    this.launches.end(conversationId)
  }

  /**
   * Коннектор выключен, удалён или IDE выходит: закрыть все сессии. Выход IDE ждёт этого, но не
   * дольше DISPOSE_WAIT_MS - зависшее расширение не должно держать выход.
   */
  async dispose(): Promise<void> {
    clearInterval(this.idleTimer)
    this.launches.dispose()

    for (const off of this.unsubscribe) off()

    await Promise.race([
      Promise.allSettled(this.sessions.all().map((session) => this.finish(session.id))),
      new Promise((resolve) => setTimeout(resolve, DISPOSE_WAIT_MS).unref()),
    ])
  }

  /** Сессия ещё та же: её не закончили (finish, Stop, конец разговора), пока шёл запрос. */
  private isLive(session: BrowserSession): boolean {
    return this.sessions.get(session.id) === session
  }

  private heldTab(session: BrowserSession, wanted: WantedTab | undefined): HeldTab | null {
    if (!wanted) return session.current ? (session.tabs.get(session.current) ?? null) : null

    return (
      [...session.tabs.values()].find(
        (tab) =>
          tab.tabId === wanted.tabId &&
          (!wanted.profileKey || tab.profileKey === wanted.profileKey),
      ) ?? null
    )
  }

  private hold(
    session: BrowserSession,
    profileKey: string,
    tabId: number,
    owned: boolean,
    url: string,
  ): HeldTab | null {
    const tab = this.sessions.hold(session, profileKey, tabId, owned, this.now())

    if (tab) {
      tab.url = url
      tab.launch = this.hub.profile(profileKey)?.launch ?? ''
    }

    return tab
  }

  /** Сессию пора закончить (её разговор не вернулся или закрыт). */
  private expire(sessionId: string): void {
    this.notices.delete(sessionId)
    void this.finish(sessionId).catch((error: unknown) => {
      console.warn('[browser] сессия не закрылась', error)
    })
  }

  private async detachIdle(): Promise<void> {
    for (const tab of this.sessions.idle(this.now(), IDLE_DETACH_MS)) {
      tab.attached = false
      await this.hub
        .request(tab.profileKey, 'debugger.detach', { tabId: tab.tabId })
        .catch(() => undefined)
    }
  }

  private pushSummaries(profileKey: string): void {
    void this.hub
      .request(profileKey, 'sessions.set', { sessions: this.sessions.summaries(profileKey) })
      .catch(() => undefined)
  }
}

const NO_TAB = 'No tab yet: open one with "open" or take a tab reference with "take".'

const NO_PROFILE =
  'No Chrome profile is connected. Ask the user to install the Agentic Workstation extension (Agentic Workstation → Connectors → Browser) and keep Chrome open.'

const staleReference = (tabId: number) =>
  `This tab reference is from an earlier Chrome session: Chrome restarted since, and tab ${tabId} may now be a different tab. Ask the user to copy a fresh reference (right-click the page, Copy tab reference for AI), or pick the tab from "tabs".`

const otherTitle = (tabId: number, now: string, wanted: string) =>
  `Tab ${tabId} is now "${now}", not "${wanted}": the reference looks stale. Check "tabs" or ask the user for a fresh reference.`

const listProfiles = (profiles: readonly BrowserProfile[]): string =>
  profiles.length
    ? `Connected: ${profiles.map((profile) => `${profile.name} (${profile.key})`).join(', ')}.`
    : NO_PROFILE
