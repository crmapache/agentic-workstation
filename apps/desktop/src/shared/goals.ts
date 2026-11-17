/**
 * Поручения - задания «до результата» (ADR 0080): одна долгая жизнь вместо прогона на срок.
 * Модель работает, а когда остаётся ждать, засыпает и говорит, чего ждёт. Ждать IDE помогает
 * сама и дёшево: повторяет вызов коннектора на чтение без модели, на перемену зовёт дешёвую
 * модель, и только настоящее событие будит рабочую.
 */

/**
 * Как поручение пишет людям. confirm - каждое сообщение ждёт кнопки человека в уведомлениях;
 * drafts - только черновики, отправляет человек; free - само, без вопроса.
 */
export type GoalOutbound = 'confirm' | 'drafts' | 'free'

export const GOAL_OUTBOUNDS: readonly GoalOutbound[] = ['confirm', 'drafts', 'free']

/** Пределы поручения: деньги на всю жизнь и сколько дней оно живёт без результата. */
export type GoalSettings = {
  outbound: GoalOutbound
  /** Потолок денег на поручение целиком: работа и проверки, по ценам API. */
  budgetUsd: number
  /** Через столько дней без результата поручение кончается и зовёт человека. */
  lifeDays: number
}

export const GOAL_BUDGETS: readonly number[] = [1, 2, 5, 10, 20, 50]

export const GOAL_LIFE_DAYS: readonly number[] = [1, 3, 7, 14, 30]

export const DEFAULT_GOAL: GoalSettings = { outbound: 'confirm', budgetUsd: 5, lifeDays: 7 }

/**
 * Что сторожит IDE, пока поручение спит. tool - вызов инструмента коннектора на чтение, который
 * IDE повторяет сама и сравнивает ответ; look - короткая проверка дешёвой моделью по словам
 * (страница сайта, поиск), когда одним вызовом не проверить.
 */
export type GoalWatchKind = 'tool' | 'look'

export type GoalWatch = {
  id: string
  kind: GoalWatchKind
  /** tool: имя сервера коннектора и инструмент; look - пусто. */
  server: string
  tool: string
  args: Record<string, unknown>
  /** look: что посмотреть и как. */
  instructions: string
  /** Чего ждём - словами модели: по ним дешёвая модель отличает событие от шума. */
  expect: string
  /** Как часто проверять, минуты; спокойствие растягивает (goal-clock). */
  everyMin: number
  nextAt: number
  /** Последняя проверка; 0 - ещё не было. */
  lastAt: number
  /** Когда ответ менялся в последний раз (или когда встал сторож). */
  changedAt: number
  /** Отпечаток последнего ответа инструмента. */
  hash: string
  /** Что видно сейчас - коротко: дешёвая модель сравнивает с ним новое. */
  seen: string
  /** Проверок подряд, которые не прошли. */
  failures: number
  lastError: string
}

/** Чего поручение ждёт во сне. */
export type GoalWait = {
  /** Одной строкой, для человека: «ответа Кори в треде про звонок». */
  reason: string
  since: number
  /** Проснуться в этот момент, что бы ни случилось; 0 - без срока. */
  until: number
  /** Ждёт ответа самого человека (кнопка уведомления, его слово). */
  person: boolean
  watches: GoalWatch[]
  /**
   * Слова, с которыми разбудить в срок, если сон поставила сама IDE (повтор после сбоя,
   * продолжение после перезапуска); пусто - обычное «пришёл срок».
   */
  note: string
}

export type GoalEventKind =
  | 'started'
  | 'slept'
  | 'changed'
  | 'noise'
  | 'watchFailed'
  | 'woke'
  | 'chapter'
  | 'resumed'
  | 'retry'
  | 'nudged'
  | 'confirmAsked'
  | 'confirmed'
  | 'refused'
  | 'finished'
  | 'limit'

/** Строка истории поручения: что случилось, словами, и во что обошлось (проверка). */
export type GoalEvent = { at: number; kind: GoalEventKind; text: string; costUsd: number }

/** Модель кончает ход поручения одним из исходов; без решения IDE спросит ещё раз. */
export type GoalOutcome = 'done' | 'failed'

/**
 * Решение модели за ход: уснуть до события или закончить. Пишется в жизнь сразу, а применяется
 * в конце хода: IDE, закрытая посреди хода, знает его после перезапуска.
 */
export type GoalDecision =
  { kind: 'wait'; wait: GoalWait } | { kind: 'finish'; outcome: GoalOutcome; report: string }

/** Жизнь поручения - то, что знает IDE помимо прогона: журнал, сон, главы, расходы. */
export type GoalLife = {
  runId: string
  taskId: string
  /** С какого момента считается срок жизни: начало или продолжение человеком после предела. */
  since: number
  /** Журнал, который ведёт модель: что сделано, с кем, о чём договорились, чего ждём. */
  journal: string
  /** Чего ждёт, пока спит; null - работает (или оборвана закрытой IDE). */
  wait: GoalWait | null
  decided: GoalDecision | null
  /** Разговоры прежних глав, старые первыми; текущий - sessionId прогона. */
  chapters: string[]
  /** Контекст последнего хода, токены: по нему решается новая глава. */
  contextTokens: number
  /** Деньги проверок (дешёвая модель); работа - costUsd прогона. */
  checksUsd: number
  /** Сколько раз будили рабочую модель за день (YYYY-MM-DD местного дня). */
  wakeDay: string
  wakesToday: number
  /** Подряд поднятых заново после закрытой IDE и сбоев - чтобы не крутиться петлёй. */
  retries: number
  events: GoalEvent[]
}

/** Сводка жизни поручения для списка: без журнала и истории. */
export type GoalSummary = {
  runId: string
  taskId: string
  wait: Omit<GoalWait, 'watches'> | null
  /** Ближайшая проверка сторожа; 0 - сторожей нет. */
  nextCheckAt: number
  watches: number
  chapters: number
  checksUsd: number
}
