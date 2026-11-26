import type { Question, QuestionAnswers } from './conversation'
import type { ProviderId } from './providers'

/**
 * Уведомления IDE (ADR 0069) - одно место, куда приходит всё, что ждёт человека: вопросы и
 * разрешения прогонов заданий, их отчёты и сбои, сообщения и напоминания, которые прислал
 * ИИ инструментом notify. Кнопка в уведомлении - действие: ответ, разрешение, открыть файл.
 */

/**
 * Что за уведомление. question, permission, plan - прогон задания стоит и ждёт ответа;
 * report и failure - прогон кончился; message и reminder - прислал ИИ (reminder - на время).
 */
export type InboxKind =
  'question' | 'permission' | 'plan' | 'report' | 'failure' | 'message' | 'reminder'

/** Ждёт ответа: без него прогон стоит. */
export const ASKING_KINDS: readonly InboxKind[] = ['question', 'permission', 'plan']

/**
 * Кнопка уведомления.
 * - reply - слова в разговор, приславший уведомление (value - что сказать; пусто - подпись);
 * - open - открыть адрес (http, https) или файл и папку машины (value);
 * - dismiss - закрыть уведомление;
 * - allow, deny - ответ на разрешение прогона; approve, revise - на план; answer - ответ на
 *   вопросы AskUserQuestion (выбранное - в answers нажатия);
 * - showRun - открыть прогон в виде заданий; openChat - разговор прогона вкладкой панели;
 * - runAgain - тот же запуск заново; resume - продолжить прерванный разговор прогона;
 * - showCalendar - открыть календарь звонков (накладка, ADR 0114);
 * - syncCalendar - прочитать все календари и открыть календарь (утро без синка, ADR 0116).
 */
export type InboxActionKind =
  | 'reply'
  | 'open'
  | 'dismiss'
  | 'allow'
  | 'deny'
  | 'approve'
  | 'revise'
  | 'answer'
  | 'showRun'
  | 'openChat'
  | 'runAgain'
  | 'resume'
  | 'showCalendar'
  | 'syncCalendar'

/** Кнопка; label пуст - подпись по виду кнопки даёт окно (i18n). */
export type InboxAction = {
  id: string
  kind: InboxActionKind
  label: string
  value: string
  primary: boolean
}

/** Откуда уведомление: прогон задания, разговор панели или ни то ни другое. */
export type InboxOrigin =
  | { kind: 'task'; taskId: string; runId: string }
  | { kind: 'chat'; provider: ProviderId; conversationId: string; sessionId: string }
  | { kind: 'none' }

export type InboxTone = 'info' | 'attention' | 'success' | 'danger'

export type InboxItem = {
  id: string
  kind: InboxKind
  tone: InboxTone
  title: string
  /** Markdown. */
  body: string
  /** Задание или иное, от чьего имени: имя задания, имя вкладки разговора. */
  source: string
  projectPath: string
  origin: InboxOrigin
  actions: InboxAction[]
  /** Вопросы AskUserQuestion (kind question). */
  questions: Question[]
  /** Разрешение: что за инструмент и что именно (команда, файл). Сбой - подробность CLI. */
  tool: string
  detail: string
  /** Сбой прогона кодом (TaskFailure): текст причины даёт окно. */
  reason: string
  /** Управляющий запрос CLI, на который это ответ (вопросы прогона). */
  requestId: string
  createdAt: number
  /** Когда показать; позже «сейчас» - запланировано (напоминание). */
  deliverAt: number
  /** Когда показано (карточка, звук, баннер ОС); 0 - ещё нет: срок не пришёл или IDE была закрыта. */
  arrivedAt: number
  /** 0 - не прочитано. */
  readAt: number
  /** 0 - открыто; иначе закрыто (ответ, кнопка, крестик, вопрос снят). */
  doneAt: number
  /** Чем закрыто: подпись нажатой кнопки или слово (dismissed, answered, withdrawn). */
  outcome: string
}

export type InboxState = {
  /** Открытые, запланированные и недавно закрытые - новые первыми. */
  items: InboxItem[]
}

/** Нажатие кнопки: text - свои слова (ответ, замечание к плану), answers - ответ на вопросы. */
export type InboxActRequest = {
  itemId: string
  actionId: string
  text: string
  answers: QuestionAnswers | null
}

/** Отказ главного процесса словом, на которое у окна есть текст. */
export type InboxCode =
  | 'itemGone'
  | 'actionGone'
  | 'runGone'
  | 'runBusy'
  | 'chatGone'
  | 'openFailed'
  | 'notWritten'
  | 'badTime'
  | 'noTitle'
  | 'failed'

export type InboxOutcome = { ok: true; state: InboxState } | { ok: false; code: InboxCode }

/** Напоминание самому себе из окна - без ИИ. */
export type InboxReminderRequest = { title: string; body: string; deliverAt: number }

/** Видно ли уже (показано) и не закрыто. */
export const isInboxOpen = (item: InboxItem): boolean => item.doneAt === 0 && item.arrivedAt > 0

/** Ждёт своего срока: напоминание, которое ещё не показано. */
export const isInboxScheduled = (item: InboxItem): boolean =>
  item.doneAt === 0 && item.arrivedAt === 0

/** Ждёт ли ответа: вопрос прогона, который ещё открыт. */
export const isInboxAsking = (item: InboxItem): boolean =>
  item.doneAt === 0 && ASKING_KINDS.includes(item.kind)

/**
 * Сколько ждёт человека - число на иконке вида: вопросы прогонов и всё непрочитанное
 * открытое. Прочитанный отчёт счёт не держит, вопрос держит, пока на него не ответили.
 */
export const inboxCount = (state: InboxState): number =>
  state.items.filter((item) => isInboxOpen(item) && (isInboxAsking(item) || item.readAt === 0))
    .length
