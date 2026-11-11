import type { SessionSummary } from '@agentic-workstation/browser-protocol/protocol'

import type { ConsoleEntry } from './console-log'
import type { ElementRef } from './frame-refs'
import type { Point } from './human-motion'

/** Вкладка, которую держит сессия агента. */
export type HeldTab = {
  key: string
  profileKey: string
  tabId: number
  /** Открыл агент (закроется на finish) или взял у человека по ссылке (отпустится). */
  owned: boolean
  /**
   * Группа, в которой агент открыл вкладку; у взятой - -1. Вкладку, которую человек вытащил
   * из этой группы, finish не закрывает: человек оставил её себе.
   */
  groupId: number
  /** Отладчик подключён сейчас: после минуты простоя он отключается, вкладка остаётся. */
  attached: boolean
  /**
   * Профиль Chrome отключился (расширение перезагрузилось, Chrome перезапускается, host
   * упал): вкладка помнится, пока профиль не вернётся и не скажет, жива ли она.
   */
  offline: boolean
  /** Последний известный адрес: сменился - ссылки снимка больше не указывают на страницу. */
  url: string
  /**
   * Метка запуска Chrome, когда вкладку взяли: после перезапуска браузера id вкладок раздаются
   * заново, и вкладка с прежней меткой - уже не наша, даже если такой id снова есть.
   */
  launch: string
  /** Ссылки последнего снимка: e12 и f2e7 → узел DOM и его фрейм. */
  refs: Map<string, ElementRef>
  /** Где мышь агента в окне вкладки; null - ещё не двигали: путь начнётся с середины окна. */
  pointer: Point | null
  console: ConsoleEntry[]
  lastUsed: number
}

/**
 * Сессия браузера одного разговора (ADR 0040): своя группа вкладок и свои вкладки. Ключ -
 * разговор (вкладка панели, сессия сценария), а не процесс: процесс разговора сменяется
 * (перезапуск ради коннекторов, другой аккаунт, сон), а работа в браузере продолжается. Два
 * разговора не делят ни группу, ни вкладки.
 */
export type BrowserSession = {
  id: string
  title: string
  /** Где живёт группа сессии: профиль Chrome и id группы; группы ещё нет - null. */
  group: { profileKey: string; groupId: number } | null
  tabs: Map<string, HeldTab>
  /** Вкладка по умолчанию для инструментов без явной вкладки - последняя взятая или открытая. */
  current: string | null
  /**
   * Что сказать модели вместе со следующим ответом: страница не дала уйти, Chrome забрал
   * вкладку у отладчика. В отличие от отказа после Stop, вызов при этом выполняется.
   */
  notes: string[]
}

/** Что сделать с вкладками кончившейся сессии. */
export type SessionEnd = { owned: HeldTab[]; taken: HeldTab[] }

export const tabKey = (profileKey: string, tabId: number): string => `${profileKey}/${tabId}`

/**
 * Реестр сессий браузера: кто какую вкладку держит. Чистый - без связи с Chrome; связью
 * занимается BrowserAgent.
 */
export class BrowserSessions {
  private readonly sessions = new Map<string, BrowserSession>()

  get(id: string): BrowserSession | null {
    return this.sessions.get(id) ?? null
  }

  all(): BrowserSession[] {
    return [...this.sessions.values()]
  }

  /**
   * Сессия запуска; новая получает имя группы. Такое имя уже у живой сессии (два разговора в
   * одном проекте) - с номером, чтобы человек отличал группы.
   */
  ensure(id: string, title: string): BrowserSession {
    const existing = this.sessions.get(id)

    if (existing) return existing

    const taken = new Set(this.all().map((session) => session.title))
    let unique = title

    for (let index = 2; taken.has(unique); index += 1) unique = `${title} ${index}`

    const session: BrowserSession = {
      id,
      title: unique,
      group: null,
      tabs: new Map(),
      current: null,
      notes: [],
    }

    this.sessions.set(id, session)

    return session
  }

  /** Какая сессия держит вкладку. */
  holderOf(key: string): BrowserSession | null {
    return this.all().find((session) => session.tabs.has(key)) ?? null
  }

  /**
   * Взять вкладку в сессию; она становится текущей. Вкладку другой сессии не отнять - вернётся
   * null: два разговора в одной вкладке мешали бы друг другу.
   */
  hold(session: BrowserSession, profileKey: string, tabId: number, owned: boolean, now: number) {
    const key = tabKey(profileKey, tabId)
    const holder = this.holderOf(key)

    if (holder && holder !== session) return null

    const tab: HeldTab = session.tabs.get(key) ?? {
      key,
      profileKey,
      tabId,
      owned,
      groupId: -1,
      attached: false,
      offline: false,
      url: '',
      launch: '',
      refs: new Map(),
      pointer: null,
      console: [],
      lastUsed: now,
    }

    session.tabs.set(key, tab)
    session.current = key

    return tab
  }

  /** Отпустить вкладку: текущей становится последняя оставшаяся. */
  drop(session: BrowserSession, key: string): HeldTab | null {
    const tab = session.tabs.get(key) ?? null

    session.tabs.delete(key)

    if (session.current === key) session.current = [...session.tabs.keys()].at(-1) ?? null

    return tab
  }

  /** Человек закрыл вкладку: убрать её из сессии, которая её держала. */
  tabClosed(profileKey: string, tabId: number): BrowserSession | null {
    const key = tabKey(profileKey, tabId)
    const session = this.holderOf(key)

    if (session) this.drop(session, key)

    return session
  }

  /**
   * Человек закрыл группу: сессия её забывает и следующую вкладку откроет в новой группе, а
   * не воскресит старую молча.
   */
  groupClosed(profileKey: string, groupId: number): BrowserSession | null {
    const session = this.all().find(
      (item) => item.group?.profileKey === profileKey && item.group.groupId === groupId,
    )

    if (session) session.group = null

    return session ?? null
  }

  /** Вкладки профиля у всех сессий - с сессией, которая держит каждую. */
  heldIn(profileKey: string): { session: BrowserSession; tab: HeldTab }[] {
    return this.all().flatMap((session) =>
      [...session.tabs.values()]
        .filter((tab) => tab.profileKey === profileKey)
        .map((tab) => ({ session, tab })),
    )
  }

  /**
   * Профиль Chrome отключился: его вкладки не забываются (иначе группа агента осталась бы в
   * Chrome навсегда), а ждут возвращения профиля - отладчик с них уже снят.
   */
  profileOffline(profileKey: string): HeldTab[] {
    const tabs = this.heldIn(profileKey).map(({ tab }) => tab)

    for (const tab of tabs) {
      tab.offline = true
      tab.attached = false
    }

    return tabs
  }

  /** Текущей стала другая вкладка сессии (последняя), а не эта: этой пользоваться нельзя. */
  moveCurrentFrom(session: BrowserSession, key: string): void {
    if (session.current !== key) return

    session.current = [...session.tabs.keys()].filter((item) => item !== key).at(-1) ?? null
  }

  /** Сессия кончилась: её вкладки - какие закрыть (открыл агент) и какие отпустить. */
  end(id: string): SessionEnd | null {
    const session = this.sessions.get(id)

    if (!session) return null

    this.sessions.delete(id)

    const tabs = [...session.tabs.values()]

    return { owned: tabs.filter((tab) => tab.owned), taken: tabs.filter((tab) => !tab.owned) }
  }

  /** Сессии для окна расширения одного профиля: имя группы и вкладки этого профиля. */
  summaries(profileKey: string): SessionSummary[] {
    return this.all().flatMap((session) => {
      const tabIds = [...session.tabs.values()]
        .filter((tab) => tab.profileKey === profileKey)
        .map((tab) => tab.tabId)

      return tabIds.length ? [{ id: session.id, title: session.title, tabIds }] : []
    })
  }

  /** Вкладки с подключённым отладчиком, которых агент не трогал дольше idleMs. */
  idle(now: number, idleMs: number): HeldTab[] {
    return this.all().flatMap((session) =>
      [...session.tabs.values()].filter((tab) => tab.attached && now - tab.lastUsed > idleMs),
    )
  }
}
