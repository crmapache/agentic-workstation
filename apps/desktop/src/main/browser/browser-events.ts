import type { EventMessage } from '@agentic-workstation/browser-protocol/protocol'

import type { HubPort } from './browser-hub'
import { tabKey } from './browser-sessions'
import type { HeldTab, BrowserSession, BrowserSessions } from './browser-sessions'
import { appendConsole, consoleEntryOf } from './console-log'
import type { LoadWaitList } from './load-waits'

/** Что событиям расширения нужно от агента браузера. */
export type EventContext = {
  hub: HubPort
  sessions: BrowserSessions
  loads: LoadWaitList
  /** Что сказать модели на следующий вызов сессии - вместо ответа (сессия кончилась). */
  notices: Map<string, string>
  now: () => number
  finish: (sessionId: string) => Promise<unknown>
  pushSummaries: (profileKey: string) => void
}

const STOPPED =
  'The user pressed Stop in the browser extension: the browser session ended. Ask the user before using the browser again.'

const CANCELED =
  'The user pressed Cancel on the "started debugging this browser" bar in Chrome: the browser session ended. Ask the user before using the browser again.'

const leaveRefused = (tabId: number) =>
  `The page in tab ${tabId} has unsaved changes and asked before leaving. It is the user's tab, so the agent stayed on the page. Ask the user before leaving it.`

const lostControl = (tabId: number, url: string) =>
  `Chrome took tab ${tabId} out of the agent's control: it went to a page extensions can't control (${url || 'unknown page'}) - chrome:// pages, the Chrome Web Store, or a file: page without file access. It is no longer your current tab: open or take another tab. close_tab still closes it.`

/**
 * События расширения (ADR 0040): человек закрыл вкладку или группу, нажал Stop в окне
 * расширения или «Отмена» на плашке отладчика; страница загрузилась, ушла на другой адрес,
 * написала в консоль, открыла диалог.
 */
export const handleBrowserEvent = (
  context: EventContext,
  profileKey: string,
  event: EventMessage,
): void => {
  const { sessions, loads } = context

  if (event.name === 'tab-removed') {
    if (sessions.tabClosed(profileKey, event.data.tabId)) context.pushSummaries(profileKey)
  } else if (event.name === 'group-removed') {
    sessions.groupClosed(profileKey, event.data.groupId)
  } else if (event.name === 'tab-updated') {
    const { tab } = event.data
    const held = heldTab(context, profileKey, tab.tabId)

    if (tab.status === 'complete') loads.resolve(tabKey(profileKey, tab.tabId))

    if (held) followUrl(held.tab, tab.url)
  } else if (event.name === 'debugger-detached') {
    debuggerDetached(context, profileKey, event.data.tabId, event.data.reason)
  } else if (event.name === 'cdp-event') {
    cdpEvent(context, profileKey, event.data.tabId, event.data.method, event.data.params)
  } else if (event.name === 'session-stop' && sessions.get(event.data.sessionId)) {
    stopSession(context, event.data.sessionId, STOPPED)
  }
}

const heldTab = (
  context: EventContext,
  profileKey: string,
  tabId: number,
): { session: BrowserSession; tab: HeldTab } | null => {
  const key = tabKey(profileKey, tabId)
  const session = context.sessions.holderOf(key)
  const tab = session?.tabs.get(key)

  return session && tab ? { session, tab } : null
}

/**
 * Адрес вкладки сменился - ссылки снимка указывают на прежнюю страницу: узлы с теми же
 * номерами могут оказаться чужими элементами. Модель возьмёт новый снимок.
 */
const followUrl = (tab: HeldTab, url: string): void => {
  if (tab.url && url && url !== tab.url) tab.refs.clear()

  if (url) tab.url = url
}

/** Сессию остановил человек: модель узнает об этом следующим вызовом, вкладки уходят. */
const stopSession = (context: EventContext, sessionId: string, notice: string): void => {
  context.notices.set(sessionId, notice)
  void context.finish(sessionId)
}

const debuggerDetached = (
  context: EventContext,
  profileKey: string,
  tabId: number,
  reason: string,
): void => {
  const held = heldTab(context, profileKey, tabId)

  if (!held) return

  held.tab.attached = false

  // «Отмена» на плашке Chrome - то же, что Stop (ADR 0040): Chrome снимает отладчик со всех
  // вкладок расширения, и полуотпущенная сессия не закрыла бы свои вкладки на finish.
  if (reason === 'canceled_by_user') {
    stopSession(context, held.session.id, CANCELED)

    return
  }

  // Отладчик снят, а вкладка жива: она ушла на страницу, куда Chrome расширения не пускает
  // (магазин расширений, chrome://). Текущей ей оставаться нельзя - каждый вызов упирался бы
  // в отказ подключения.
  if (reason === 'target_closed') {
    void context.hub
      .request(profileKey, 'tabs.get', { tabId })
      .then((info) => {
        if (!info || !held.session.tabs.has(held.tab.key)) return

        context.sessions.moveCurrentFrom(held.session, held.tab.key)
        held.session.notes.push(lostControl(tabId, info.url))
      })
      .catch(() => undefined)
  }
}

const cdpEvent = (
  context: EventContext,
  profileKey: string,
  tabId: number,
  method: string,
  params: unknown,
): void => {
  const key = tabKey(profileKey, tabId)
  const held = heldTab(context, profileKey, tabId)

  if (method === 'Page.loadEventFired') context.loads.resolve(key)

  if (!held) return

  // Новый документ в главном фрейме: прежние узлы снимка ушли вместе со старой страницей.
  if (method === 'Page.frameNavigated' && isMainFrame(params)) {
    held.tab.refs.clear()

    return
  }

  if (method === 'Page.javascriptDialogOpening') {
    answerDialog(context, held, params)

    return
  }

  const entry = consoleEntryOf(method, params, context.now())

  if (entry) appendConsole(held.tab.console, entry)
}

const isMainFrame = (params: unknown): boolean => {
  const frame = (params as { frame?: { parentId?: string } } | null)?.frame

  return Boolean(frame) && !frame?.parentId
}

/**
 * Диалог страницы остановил бы её и все команды - на него отвечает агент. alert и confirm
 * принимаются. «Покинуть сайт?» на вкладке человека - нет: там могут быть его несохранённые
 * правки, и решать ему; модель узнаёт об этом с ответом. На своей вкладке агента уйти можно.
 */
const answerDialog = (
  context: EventContext,
  { session, tab }: { session: BrowserSession; tab: HeldTab },
  params: unknown,
): void => {
  const dialog = (params as { message?: string; type?: string } | null) ?? {}
  const keep = dialog.type === 'beforeunload' && !tab.owned

  appendConsole(tab.console, {
    level: 'dialog',
    text: `${dialog.type ?? 'dialog'}: ${dialog.message ?? ''} (${keep ? 'dismissed: the user must decide' : 'accepted'})`,
    at: context.now(),
  })

  if (keep) session.notes.push(leaveRefused(tab.tabId))

  void context.hub
    .request(tab.profileKey, 'cdp', {
      tabId: tab.tabId,
      method: 'Page.handleJavaScriptDialog',
      params: { accept: !keep },
    })
    .catch(() => undefined)
}
