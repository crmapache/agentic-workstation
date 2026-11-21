import type {
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

/** Что отправляют в очередь сценариев: группу или одну карточку. */
export type TrackerSending = { kind: 'group'; groupId: string } | { kind: 'card'; cardId: string }

export type TrackerDialog = 'archive' | 'cloud'

/** Отказ правки или отправки и итог отправки - уведомлением в углу окна. */
export type TrackerNotice =
  { kind: 'failed'; code: TrackerCode | TrackerSendCode } | { kind: 'sent'; count: number } | null

/**
 * Только что удалённое - карточка в углу с «Undo»; kind - чем было удалённое, projectId - проект
 * IDE, где удаляли: «Undo» после перехода в другой проект возвращает туда, а не в открытый.
 */
export type TrackerUndo = {
  ids: string[]
  kind: 'card' | 'group' | 'flow'
  projectId: string
} | null

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
