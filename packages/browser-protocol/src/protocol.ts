/**
 * Протокол «браузера для ИИ» (docs/workplan/30-browser.md, ADR 0040): расширение Chrome в
 * профиле человека ↔ native host ↔ BrowserHub в главном процессе IDE. Расширение - тонкое:
 * вкладки, группа, отладчик (сырые команды CDP), курсор и рамка. Вся логика действий (клик по
 * элементу, ввод, снимок) - в IDE: так распакованное расширение почти не нужно обновлять, а
 * логика проверяется тестами без браузера.
 *
 * Только типы и чистые данные: пакет едет и в расширение, и в Node.
 */

/**
 * Имена native host. У установленной IDE и у dev свои: обе могут быть запущены разом, и
 * расширение держит связь с каждой, которая ответила.
 */
export const HOST_NAMES = {
  installed: 'com.agentic_workstation.browser',
  dev: 'com.agentic_workstation.browser_dev',
} as const

export type HostChannel = keyof typeof HOST_NAMES

export const HOST_CHANNELS: readonly HostChannel[] = ['installed', 'dev']

/**
 * Chrome не пропускает сообщение host → расширение больше 1 МБ. В обратную сторону предел
 * 64 МБ - поэтому картинки и дерево страницы идут от расширения, а не к нему.
 */
export const HOST_TO_CHROME_MAX_BYTES = 1024 * 1024

/** Вкладка, как её видит IDE. groupId -1 - вне группы (как в chrome.tabs). */
export type TabInfo = {
  tabId: number
  windowId: number
  index: number
  title: string
  url: string
  active: boolean
  groupId: number
  status: 'loading' | 'complete' | 'unloaded'
}

export type GroupInfo = {
  groupId: number
  windowId: number
  title: string
  color: string
  collapsed: boolean
}

/** Что сделать курсором в точке: только подъехать или ещё и показать нажатие. */
export type CursorAction = 'move' | 'click' | 'double' | 'right'

/** Сессия агента для окна расширения: имя группы и вкладки, которые она держит. */
export type SessionSummary = { id: string; title: string; tabIds: number[] }

/** Методы, которые IDE зовёт у расширения: параметры и ответ. */
export type BrowserMethods = {
  /** Все вкладки и группы всех окон профиля (решение владельца: ИИ видит всё). */
  'tabs.list': {
    params: Record<string, never>
    result: { tabs: TabInfo[]; groups: GroupInfo[]; focusedWindowId: number | null }
  }
  'tabs.get': { params: { tabId: number }; result: TabInfo | null }
  /**
   * Новая неактивная вкладка: в группу groupId, если она жива, иначе - новая оранжевая группа
   * groupTitle в окне, где человек был последним.
   */
  'tabs.open': {
    params: { url: string; groupId: number | null; groupTitle: string }
    result: { tab: TabInfo; groupId: number }
  }
  'tabs.close': { params: { tabIds: number[] }; result: null }
  /** Вывести вкладки из группы - чужие вкладки, которые человек перетащил в группу агента. */
  'tabs.ungroup': { params: { tabIds: number[] }; result: null }
  'debugger.attach': { params: { tabId: number }; result: null }
  'debugger.detach': { params: { tabId: number }; result: null }
  /**
   * Сырая команда CDP во вкладке с подключённым отладчиком. Accessibility.getFullAXTree
   * расширение отдаёт прореженным и с пометкой truncated (AxTreeResult): полное дерево длинной
   * страницы - десятки мегабайт, а модели нужно начало.
   */
  cdp: {
    params: { tabId: number; method: string; params: Record<string, unknown> }
    result: unknown
  }
  /** Рамка по краю страницы, пока агент держит вкладку. */
  'overlay.frame': { params: { tabId: number; on: boolean }; result: null }
  /** Плавно подвести курсор к точке (CSS-пиксели окна страницы); ответ - когда доехал. */
  'overlay.cursor': {
    params: { tabId: number; x: number; y: number; action: CursorAction }
    result: null
  }
  /** Сессии агентов этой IDE в профиле - для окна расширения (кнопка Stop). */
  'sessions.set': { params: { sessions: SessionSummary[] }; result: null }
}

export type BrowserMethod = keyof BrowserMethods

/** Ответ расширения на Accessibility.getFullAXTree: узлы по порядку обхода и обрезано ли. */
export type AxTreeResult = { nodes: unknown[]; truncated?: boolean }

/**
 * Предел ответа расширения host: Chrome не пропустит в host сообщение больше 64 МБ. Расширение
 * держит ответ ниже с запасом на обёртку и отвечает отказом too-large, а не рвёт порт.
 */
export const CHROME_TO_HOST_MAX_BYTES = 60 * 1024 * 1024

/** События расширения: IDE по ним узнаёт, что человек закрыл вкладку или группу. */
export type BrowserEvents = {
  /** Только вкладки с подключённым отладчиком: остальные IDE не нужны. */
  'tab-updated': { tab: TabInfo }
  'tab-removed': { tabId: number }
  'group-removed': { groupId: number }
  /** Отладчик отключился сам: вкладку закрыли или человек нажал «Отмена» в плашке Chrome. */
  'debugger-detached': { tabId: number; reason: string }
  /** Событие CDP из белого списка расширения (консоль, загрузка страницы, диалоги). */
  'cdp-event': { tabId: number; method: string; params: unknown }
  /** Человек нажал Stop в окне расширения. */
  'session-stop': { sessionId: string }
  'profile-renamed': { name: string }
}

export type BrowserEventName = keyof BrowserEvents

/** Почему расширение не выполнило запрос, кодом: текст - для журнала и модели. */
export type BrowserErrorCode =
  | 'no-tab'
  | 'no-window'
  | 'attach-failed'
  | 'not-attached'
  | 'cdp'
  | 'overlay'
  | 'bad-request'
  | 'too-large'
  | 'failed'

export type BrowserErrorBody = { code: BrowserErrorCode; message: string }

/** Первое сообщение расширения после связи с IDE: кто это. */
export type HelloMessage = {
  type: 'hello'
  /** Короткий постоянный id установки расширения в этом профиле Chrome. */
  profileKey: string
  /** Имя профиля, которое человек видит и меняет в окне расширения. */
  profileName: string
  /** Браузер: Google Chrome, Brave, Microsoft Edge… */
  browser: string
  version: string
  /** Сборка расширения: по ней IDE понимает, что в папке лежит новая. */
  build: string
  /**
   * Метка запуска Chrome: новая на каждом старте браузера. id вкладок после перезапуска
   * раздаются заново, и ссылка с прежней меткой указала бы на чужую вкладку (tab-reference.ts).
   * Старое расширение, которое ещё не перезагрузилось на новую сборку, её не шлёт - пусто.
   */
  launch: string
}

/**
 * Ответ IDE на hello. extensionBuild - сборка, которую IDE положила в папку расширения:
 * другая - расширение перезагружает себя (chrome.runtime.reload) и берёт новую с диска.
 */
export type WelcomeMessage = {
  type: 'welcome'
  channel: HostChannel
  ideVersion: string
  extensionBuild: string | null
}

export type RequestMessage = {
  [M in BrowserMethod]: {
    type: 'request'
    id: number
    method: M
    params: BrowserMethods[M]['params']
  }
}[BrowserMethod]

export type ResponseMessage =
  | { type: 'response'; id: number; result: unknown }
  | { type: 'response'; id: number; error: BrowserErrorBody }

export type EventMessage = {
  [E in BrowserEventName]: { type: 'event'; name: E; data: BrowserEvents[E] }
}[BrowserEventName]

/**
 * Состояние связи host ↔ IDE для расширения: host запущен Chrome, но IDE может быть не
 * запущена - тогда он так и говорит, а не молчит.
 */
export type HostStatus = 'connected' | 'ide-offline'

export type HostStatusMessage = { type: 'host'; status: HostStatus }

export type ExtensionToIde = HelloMessage | ResponseMessage | EventMessage

export type IdeToExtension = WelcomeMessage | RequestMessage

export type HostToExtension = IdeToExtension | HostStatusMessage

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Сообщение расширения из строки сокета; чужое и битое - null. */
export const parseExtensionMessage = (value: unknown): ExtensionToIde | null => {
  if (!isRecord(value)) return null

  if (value['type'] === 'hello') {
    const { profileKey, profileName, browser, version, build, launch } = value

    // Без метки запуска hello всё равно принимается: иначе расширение прежней сборки не
    // получило бы welcome и не перезагрузилось бы на новую.
    return typeof profileKey === 'string' &&
      typeof profileName === 'string' &&
      typeof browser === 'string' &&
      typeof version === 'string' &&
      typeof build === 'string'
      ? {
          type: 'hello',
          profileKey,
          profileName,
          browser,
          version,
          build,
          launch: typeof launch === 'string' ? launch : '',
        }
      : null
  }

  if (value['type'] === 'response' && typeof value['id'] === 'number') {
    const error = value['error']

    if (isRecord(error) && typeof error['message'] === 'string') {
      return {
        type: 'response',
        id: value['id'],
        error: {
          code: (error['code'] as BrowserErrorCode | undefined) ?? 'failed',
          message: error['message'],
        },
      }
    }

    return { type: 'response', id: value['id'], result: value['result'] ?? null }
  }

  if (value['type'] === 'event' && typeof value['name'] === 'string' && isRecord(value['data'])) {
    return value as EventMessage
  }

  return null
}
