import type {
  TrackerOp,
  TrackerDue,
  TrackerCard,
  TrackerCode,
  TrackerFlow,
  TrackerTask,
  TrackerBoard,
  TrackerGroup,
  TrackerProject,
  TrackerSendCode,
} from '@shared/tracker'

/** Что правится в окне по центру: карточка, новая карточка или заголовок проекта, потока, группы. */
export type TrackerEditor =
  | { kind: 'card'; cardId: string }
  | { kind: 'newCard'; groupId: string; followUpOf: string | null }
  | { kind: 'project'; id: string | null }
  | { kind: 'flow'; id: string | null; projectId: string }
  | { kind: 'group'; id: string | null; flowId: string }

/** Готовое правило повтора: от дня срока (неделя - его день недели, месяц - число, год - дата). */
export type RepeatPreset = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'

/** Что отправляют в очередь сценариев: группу или одну карточку. */
export type TrackerSending = { kind: 'group'; groupId: string } | { kind: 'card'; cardId: string }

export type TrackerDialog = 'archive' | 'cloud'

/** Отказ правки или отправки и итог отправки - уведомлением в углу окна. */
export type TrackerNotice =
  { kind: 'failed'; code: TrackerCode | TrackerSendCode } | { kind: 'sent'; count: number } | null

/**
 * Только что сделанное, что можно вернуть, - карточка в углу с «Undo». Удалённое (kind - чем
 * было) возвращает undelete; повторяющаяся карточка, отмеченная сделанной, - правки ops (прежний
 * срок и сделанные продолжения), due - её новый срок для подписи. projectId - проект IDE, где
 * правили: «Undo» после перехода в другой проект возвращает туда, а не в открытый.
 */
export type TrackerUndo =
  | { kind: 'card' | 'group' | 'flow'; ids: string[]; projectId: string }
  | { kind: 'repeat'; due: TrackerDue; ops: TrackerOp[]; projectId: string }
  | null

/** Итог правки из окна: удалась ли, id созданного и доска после неё. */
export type TrackerApplied = { ok: boolean; created: string | null; board: TrackerBoard | null }

/** Узел доски по id (findNode) - со всеми родителями: кто ищет, берёт нужного. */
export type TrackerNode =
  | { kind: 'project'; project: TrackerProject }
  | { kind: 'flow'; flow: TrackerFlow; project: TrackerProject }
  | { kind: 'group'; group: TrackerGroup; flow: TrackerFlow; project: TrackerProject }
  | {
      kind: 'task'
      card: TrackerTask
      group: TrackerGroup
      flow: TrackerFlow
      project: TrackerProject
    }
  | {
      kind: 'followUp'
      card: TrackerCard
      task: TrackerTask
      group: TrackerGroup
      flow: TrackerFlow
      project: TrackerProject
    }
