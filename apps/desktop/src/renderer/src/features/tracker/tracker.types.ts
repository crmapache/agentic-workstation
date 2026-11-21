import type { TrackerCode, TrackerBoard, TrackerSendCode } from '@shared/tracker'

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

/** Только что удалённое - карточка в углу с «Undo»; kind - чем было удалённое. */
export type TrackerUndo = { ids: string[]; kind: 'card' | 'group' | 'flow' } | null

/** Итог правки из окна: удалась ли, id созданного и доска после неё. */
export type TrackerApplied = { ok: boolean; created: string | null; board: TrackerBoard | null }
