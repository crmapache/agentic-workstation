import type { QueueHours, QueueTarget, QueueItemState } from './scenario-queues'
import type { ScenarioCode, ScenarioScope } from './scenarios'

/**
 * Трекер задач (ADR 0101): у каждого проекта IDE своя доска - проекты трекера вкладками, в них
 * потоки, в потоке группы колонками по порядку работы, в группе задачи сверху вниз, у задачи -
 * продолжения цепочкой вправо. Доска хранится у IDE и синхронизируется с облаком шифром
 * (ADR 0102). Здесь - то, что видит окно и инструменты MCP.
 */

/** Приоритет как в Todoist: 1 - самый срочный, 4 - без приоритета. */
export type TrackerPriority = 1 | 2 | 3 | 4

export const TRACKER_PRIORITIES: readonly TrackerPriority[] = [1, 2, 3, 4]

/** Срок без пояса: дата `YYYY-MM-DD` и, если есть, время `HH:MM` - местные там, где смотрят. */
export type TrackerDue = { date: string; time: string | null }

/** Единица повтора: каждые N дней, недель, месяцев или лет. */
export type TrackerRepeatUnit = 'day' | 'week' | 'month' | 'year'

export const TRACKER_REPEAT_UNITS: readonly TrackerRepeatUnit[] = ['day', 'week', 'month', 'year']

/** Больше этого повтор не растягивается: «раз в 999 дней» - уже не расписание. */
export const TRACKER_REPEAT_MAX = 999

/**
 * Повтор карточки, как в Todoist (ADR 0103): сделанная повторяющаяся карточка не гаснет, а
 * переезжает на следующий день правила. every - через сколько единиц; weekdays - дни недельного
 * повтора (1 - понедельник … 7 - воскресенье), у других единиц пусто; start - день, от которого
 * идёт расписание: число месяца, день года и чётность недель берутся от него, поэтому разовый
 * перенос срока правило не сбивает. fromDone - следующий раз считается от дня выполнения, а не
 * по расписанию («every!» в Todoist).
 */
export type TrackerRepeat = {
  every: number
  unit: TrackerRepeatUnit
  weekdays: number[]
  start: string
  fromDone: boolean
}

/** Сколько живёт проект трекера в архиве до удаления. */
export const TRACKER_ARCHIVE_DAYS = 30

/** Потолки длины полей: заголовок - строка, описание - заметка. */
export const TRACKER_LIMITS = { title: 300, subtitle: 300, description: 20_000 } as const

/**
 * Сценарий карточки: какой сценарий и чем заполнить его поля. В значениях полей - подстановки
 * `{{card}}` (заголовок, подзаголовок и описание вместе), `{{title}}`, `{{subtitle}}`,
 * `{{description}}`: они раскрываются при отправке, так что правка карточки после привязки не
 * теряется. provider null - исполнитель, которого выбрал сам сценарий.
 */
export type TrackerScenario = {
  scenarioId: string
  scope: ScenarioScope
  provider: string | null
  inputs: Record<string, string>
}

/** Подстановки полей карточки в значениях полей сценария. */
export const TRACKER_PLACEHOLDERS = ['card', 'title', 'subtitle', 'description'] as const

/**
 * Карточка в очереди сценариев на этом компьютере: состояние элемента очереди; refused - очередь
 * отказалась его запускать и ждёт человека (папке не доверились, нет CLI), gone - элемент убрали
 * из очереди или очередь закрыли.
 */
export type TrackerRunState = QueueItemState | 'refused' | 'gone'

export type TrackerCardRun = {
  queueId: string
  itemId: string
  state: TrackerRunState
  sentAt: number
}

/** Карточка стоит в очереди (ждёт, идёт или очередь ждёт человека): второй раз её не шлют. */
export const isInQueue = (run: TrackerCardRun | null): boolean =>
  run?.state === 'waiting' || run?.state === 'running' || run?.state === 'refused'

/**
 * Почему карточка закрыта на правку (ADR 0110): run - её сценарий на нынешний срок стоит в
 * очереди, идёт или на паузе; done - сценарий её выполнил. Поля сценария раскрываются при
 * отправке, так что правка такой карточки до прогона уже не дойдёт, а у выполненной разошлась бы
 * с тем, что сделано.
 */
export type TrackerLock = 'run' | 'done'

/** Что закрытая карточка ещё принимает: заметки в описании и отметку «сделано». */
export const TRACKER_LOCK_OPEN: readonly (keyof TrackerCardFields)[] = ['description', 'done']

/**
 * Закрыта ли карточка в форме: выполненную сценарием открывает снятая отметка «сделано» той же
 * правкой - так же решает главный процесс.
 */
export const isLockedWith = (lock: TrackerLock | null, done: boolean): boolean =>
  lock === 'run' || (lock === 'done' && done)

/**
 * Поля карточки, которые правит человек или ИИ. autoRun - запускать сценарий карточки в срок на
 * этом компьютере (ADR 0103): отметка живёт только здесь и в облако не уходит, иначе один срок
 * запустил бы прогон на каждом компьютере.
 */
export type TrackerCardFields = {
  title: string
  subtitle: string
  description: string
  due: TrackerDue | null
  repeat: TrackerRepeat | null
  priority: TrackerPriority
  done: boolean
  scenario: TrackerScenario | null
  autoRun: boolean
}

export type TrackerCard = TrackerCardFields & {
  id: string
  doneAt: number | null
  /** Прогон по карточке на этом компьютере; null - не отправлялась или давно. */
  run: TrackerCardRun | null
  /** Почему запуск в срок не поставил карточку в очередь; null - не отказывал. */
  autoRunFailure: TrackerSendCode | null
  /** На нынешний срок карточка уже уходила сама: до следующего срока запуска не будет. */
  autoRunSent: boolean
  /** Закрыта на правку, кроме описания и «сделано»: почему; null - открыта. */
  lock: TrackerLock | null
}

/** Задача группы с продолжениями слева направо. */
export type TrackerTask = TrackerCard & { followUps: TrackerCard[] }

export type TrackerGroup = { id: string; title: string; subtitle: string; tasks: TrackerTask[] }

export type TrackerFlow = { id: string; title: string; subtitle: string; groups: TrackerGroup[] }

export type TrackerProject = {
  id: string
  title: string
  description: string
  flows: TrackerFlow[]
}

/** Проект в архиве: когда убран и когда удалится сам. */
export type TrackerArchived = {
  id: string
  title: string
  description: string
  archivedAt: number
  purgeAt: number
}

/** Доска проекта IDE. */
export type TrackerBoard = {
  projectPath: string
  projects: TrackerProject[]
  archived: TrackerArchived[]
}

/**
 * Правка доски одним действием. beforeId - место «перед этим», null - в конец. Карточка с
 * followUpOf - продолжение задачи (встаёт в её цепочку), без него - задача группы.
 */
export type TrackerOp =
  | { kind: 'project.create'; title: string; description?: string }
  | { kind: 'project.update'; id: string; title?: string; description?: string }
  | { kind: 'project.move'; id: string; beforeId: string | null }
  | { kind: 'project.archive'; id: string }
  | { kind: 'project.restore'; id: string }
  | { kind: 'project.purge'; id: string }
  | { kind: 'flow.create'; projectId: string; title: string; subtitle?: string }
  | { kind: 'flow.update'; id: string; title?: string; subtitle?: string }
  | { kind: 'flow.move'; id: string; projectId: string; beforeId: string | null }
  | { kind: 'flow.delete'; id: string }
  | { kind: 'group.create'; flowId: string; title: string; subtitle?: string }
  | { kind: 'group.update'; id: string; title?: string; subtitle?: string }
  | { kind: 'group.move'; id: string; flowId: string; beforeId: string | null }
  | { kind: 'group.delete'; id: string }
  | {
      kind: 'card.create'
      groupId: string
      followUpOf?: string | null
      beforeId?: string | null
      fields: Partial<TrackerCardFields> & { title: string }
    }
  | { kind: 'card.update'; id: string; fields: Partial<TrackerCardFields> }
  | {
      kind: 'card.move'
      id: string
      groupId: string
      followUpOf: string | null
      beforeId: string | null
    }
  | { kind: 'card.delete'; id: string }
  | { kind: 'undelete'; ids: string[] }

export type TrackerOpKind = TrackerOp['kind']

/** Почему правка не прошла: код для окна и слов MCP. */
export type TrackerCode =
  | 'notFound'
  | 'wrongBoard'
  | 'badTitle'
  | 'badDue'
  | 'badRepeat'
  | 'badFollowUp'
  | 'badScenario'
  | 'tooLong'
  | 'archived'
  | 'notArchived'
  | 'locked'

/**
 * Повторяющаяся карточка отмечена сделанной: срок ушёл на следующий день правила (due), undo -
 * правки, которые вернут как было (прежний срок и сделанные продолжения).
 */
export type TrackerRepeated = { cardId: string; due: TrackerDue; undo: TrackerOp[] }

/**
 * Итог правки: новая доска, id созданного и id удалённого этой правкой (для «Undo» - они же
 * уходят в undelete), сдвиг повторяющейся карточки.
 */
export type TrackerOutcome =
  | {
      ok: true
      board: TrackerBoard
      created: string | null
      removed: string[]
      repeated: TrackerRepeated | null
    }
  | { ok: false; code: TrackerCode }

/**
 * Что отправить в очередь сценариев: группу (задачи сверху вниз, у каждой - её продолжения
 * слева направо; выполненные, без сценария и уже стоящие в очереди пропускаются) или одну
 * карточку. hours - рабочие часы новой очереди (ADR 0074).
 */
export type TrackerSendRequest = {
  source: { kind: 'group'; groupId: string } | { kind: 'card'; cardId: string }
  target: QueueTarget
  hours?: QueueHours | null
}

export type TrackerSendCode =
  TrackerCode | ScenarioCode | 'nothingToSend' | 'noScenario' | 'alreadyQueued'

/** Итог отправки; при отказе cardId - карточка, на которой встали (null - до карточек). */
export type TrackerSendOutcome =
  /** sent - карточки, ушедшие запуском; placeholders - ушедшие пометками (без сценария). */
  | { ok: true; board: TrackerBoard; queueId: string; sent: string[]; placeholders: string[] }
  | { ok: false; code: TrackerSendCode; cardId: string | null }

/** Состояние облака: окно показывает его значком на шапке трекера. */
export type CloudStatus = 'off' | 'connecting' | 'synced' | 'syncing' | 'offline' | 'error'

/** Почему облако не работает: код для окна. */
export type CloudFailure =
  'noKeychain' | 'keyLost' | 'rejected' | 'accountFull' | 'server' | 'badReply'

export type CloudState = {
  status: CloudStatus
  /** Начало отпечатка ключа аккаунта: видно, один ли аккаунт на двух компьютерах. */
  accountId: string | null
  /** Ключ уже копировали: до этого значок облака зовёт сохранить ключ. */
  keySaved: boolean
  lastSyncAt: number | null
  /** Правки, которые ещё не ушли в облако. */
  pending: number
  failure: CloudFailure | null
}

/** Почему ключ не принят: не ключ, нет связки ключей, человек отказался в окне подтверждения. */
export type CloudKeyCode = 'badKey' | 'noKeychain' | 'cancelled'

export type CloudKeyOutcome = { ok: true; state: CloudState } | { ok: false; code: CloudKeyCode }
