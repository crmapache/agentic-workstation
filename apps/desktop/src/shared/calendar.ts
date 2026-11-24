import type { CalendarSettings } from './calendar-settings'
import type { AiChoice } from './ide-prefs'
import type { ProviderId } from './providers'

/**
 * Календарь звонков (ADR 0114): события из источников, которые задаёт сам человек, на одной
 * сетке с накладками. Прямые источники (Google, ICS) читает IDE, остальные - ИИ в фоне: страницу
 * в Chrome (Browser) или приложение на экране (Computer Use).
 */
export const CALENDAR_SOURCE_KINDS = ['google', 'ics', 'ai-browser', 'ai-screen'] as const

export type CalendarSourceKind = (typeof CALENDAR_SOURCE_KINDS)[number]

/** Цвет источника - номер токена `--color-calendar-N`, а не значение. */
export const CALENDAR_COLORS = [0, 1, 2, 3, 4, 5] as const

export type CalendarColor = (typeof CALENDAR_COLORS)[number]

/** Читает ли источник ИИ: только кнопкой, по одному, с тратой токенов. */
export const isAiSourceKind = (kind: CalendarSourceKind): kind is 'ai-browser' | 'ai-screen' =>
  kind === 'ai-browser' || kind === 'ai-screen'

/**
 * Провайдеры, которым можно поручить чтение календаря: прошли живую проверку чтения учебной
 * страницы с допуском шлюза (ADR 0114). Остальные видны в выборе серыми.
 */
export const CALENDAR_AI_PROVIDERS: readonly ProviderId[] = ['claude', 'codex']

/** Насколько вперёд читает ИИ: каждая неделя - листание страницы и время модели. */
export const AI_WEEKS_DEFAULT = 2
export const AI_WEEKS_MAX = 8

/** Подсказки ИИ и адрес - слова человека, но не роман: они уходят в промпт целиком. */
export const AI_HINTS_MAX = 1000

export type GoogleSourceSpec = {
  kind: 'google'
  /** Коннектор Calendar (один аккаунт Google). */
  connectorId: string
  /** Календари аккаунта; пусто - основной. */
  calendarIds: string[]
}

export type IcsSourceSpec = {
  kind: 'ics'
  /** Адрес без пути и запроса: полный - секрет, лежит в хранилище календаря. */
  urlMask: string
}

export type AiBrowserSourceSpec = {
  kind: 'ai-browser'
  /** Коннектор Browser, через который ИИ видит Chrome человека. */
  connectorId: string
  /** Профиль Chrome, где выполнен вход: модель не может уйти в другой. */
  profile: string
  /** Страница календаря; ИИ переходит только по этому сайту. */
  url: string
  hints: string
  /** Можно ли нажимать кнопки листания: нужно календарю без даты в адресе. */
  allowClicks: boolean
  weeksAhead: number
  /** Кто читает: основной и запасные, как цепочка Commit and push. */
  ai: AiChoice[]
}

export type AiScreenSourceSpec = {
  kind: 'ai-screen'
  /** Коннектор Computer Use. */
  connectorId: string
  /** Приложение, где календарь (Outlook, Teams). */
  app: string
  hints: string
  weeksAhead: number
  ai: AiChoice[]
}

export type CalendarSourceSpec =
  GoogleSourceSpec | IcsSourceSpec | AiBrowserSourceSpec | AiScreenSourceSpec

export type CalendarSourceBase = {
  id: string
  name: string
  color: CalendarColor
  /** Показывать на сетке. */
  visible: boolean
  /** Учитывать в накладках: календарь праздников, например, - нет. */
  inOverlaps: boolean
}

export type CalendarSource = CalendarSourceBase & CalendarSourceSpec

/** Вид источника из формы: у ICS полный адрес, пусто при правке - прежний. */
export type CalendarDraftSpec =
  GoogleSourceSpec | { kind: 'ics'; url: string } | AiBrowserSourceSpec | AiScreenSourceSpec

/** Источник из формы: новый - без id. */
export type CalendarSourceDraft = Omit<CalendarSourceBase, 'id'> & {
  id: string | null
} & CalendarDraftSpec

/** Правка мелочей источника с сетки, без формы. */
export type CalendarSourcePatch = Partial<Pick<CalendarSourceBase, 'visible' | 'inOverlaps'>>

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled'

/** Как событие занимает время: «свободен» в накладках не участвует. */
export type EventBusy = 'busy' | 'free' | 'tentative' | 'away'

/** Мой ответ на приглашение. */
export type EventResponse =
  'accepted' | 'tentative' | 'declined' | 'pending' | 'organizer' | 'unknown'

/**
 * Как проходит встреча: звонок (ссылка на звонок, «Teams», телефон), лично (адрес, комната,
 * карта) или не сказано. Прямые источники решают по полям события, ИИ-источник - и словом ИИ,
 * который видел встречу на странице. Угадывать по одному названию не беремся: «не сказано»
 * честнее догадки.
 */
export const EVENT_FORMATS = ['call', 'in-person', 'unknown'] as const

export type EventFormat = (typeof EVENT_FORMATS)[number]

export const isEventFormat = (value: unknown): value is EventFormat =>
  EVENT_FORMATS.includes(value as EventFormat)

/** Человек встречи: имя, почта и ссылка на него (профиль, чат), что нашлось у источника. */
export type EventPerson = { name: string; email: string | null; url: string | null }

/** Ссылка встречи, кроме звонка и самого события: повестка, документ, запись. */
export type EventLink = { label: string; url: string }

/** Гостей и ссылок у встречи храним не больше: карточке и ИИ хватает, снимок не пухнет. */
export const EVENT_PEOPLE_MAX = 50
export const EVENT_LINKS_MAX = 10

export type CalendarEvent = {
  /** Ключ события в своём источнике: uid и начало повтора. */
  key: string
  sourceId: string
  /** UID события (iCalUID у Google); у прочитанного ИИ - отпечаток названия и начала. */
  uid: string
  title: string
  /**
   * Начало и конец, мс UTC. У события на весь день - полночи UTC его дат: показывает их окно
   * по датам (allDay), а не по этим числам.
   */
  start: number
  end: number
  /** Весь день: первая дата и дата после последней (ГГГГ-ММ-ДД); null - событие со временем. */
  allDay: { from: string; to: string } | null
  status: EventStatus
  busy: EventBusy
  response: EventResponse
  /** Ссылка на звонок (Meet, Zoom, Teams), только https. */
  joinUrl: string | null
  location: string | null
  /** Ссылка на место (карта, комната), только https. */
  locationUrl: string | null
  /** Звонок, лично или не сказано: слова карточки («this call» или «this meeting») и ИИ. */
  format: EventFormat
  organizer: EventPerson | null
  /** Гости, без организатора; не больше EVENT_PEOPLE_MAX. */
  attendees: EventPerson[]
  /** Событие в самом источнике (страница Google), null - негде открыть. */
  link: string | null
  /** Прочие ссылки встречи, только https; не больше EVENT_LINKS_MAX. */
  links: EventLink[]
}

/** Почему источник не прочитался: текст - в окне по коду. */
export const CALENDAR_FAILURES = [
  'signed-out',
  'connector-missing',
  'connector-off',
  'network',
  'http',
  'parse',
  'too-large',
  'vault-unavailable',
  'provider-unsupported',
  'provider-missing',
  'ai-failed',
  'ai-invalid',
  'timeout',
  'cancelled',
  'login-required',
  'not-found',
  'profile-offline',
  'computer-busy',
  'computer-denied',
] as const

export type CalendarFailure = (typeof CALENDAR_FAILURES)[number]

export type SourceSync = {
  phase: 'idle' | 'queued' | 'running'
  /** Последний удачный синк, мс; null - ещё не было. */
  lastOkAt: number | null
  lastTriedAt: number | null
  /** Окно, которое источник подтвердил прочитанным в последний раз. */
  covered: { from: number; to: number } | null
  failure: CalendarFailure | null
  /** ИИ вернул пусто там, где раньше были события: принято, но человеку стоит взглянуть. */
  warning: 'suspicious-empty' | null
  /** Событий источника в снимке. */
  count: number
}

export const IDLE_SYNC: SourceSync = {
  phase: 'idle',
  lastOkAt: null,
  lastTriedAt: null,
  covered: null,
  failure: null,
  warning: null,
  count: 0,
}

export type CalendarSourceView = CalendarSource & { sync: SourceSync }

export type CalendarState = {
  sources: CalendarSourceView[]
  settings: CalendarSettings
  /** Растёт с каждой переменой событий: окно перечитывает свой период. */
  revision: number
  /** Непросмотренных накладок впереди (до конца окна прямых источников): счётчик на кнопке вида. */
  upcomingOverlaps: number
  /** Начала непросмотренных накладок впереди по порядку (мс UTC, до 50): «следующая» листает к ней. */
  nextOverlaps: number[]
  /** Ключи накладок, которые человек отметил просмотренными: на сетке они не горят. */
  seenOverlaps: string[]
  /** Хранилище секретов недоступно: ICS-ссылку не сохранить. */
  vault: boolean
}

export type CalendarOutcome =
  | { ok: true; state: CalendarState; id: string }
  | { ok: false; code: 'invalid' | 'not-found' | 'vault-unavailable' | 'connector-missing' }

/** Календари аккаунта Google для формы источника. */
export type GoogleCalendarsOutcome =
  | { ok: true; calendars: { id: string; name: string; primary: boolean }[] }
  | { ok: false; failure: CalendarFailure }
