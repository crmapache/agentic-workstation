import type { TrackerOp, TrackerBoard, TrackerSendRequest } from '@shared/tracker'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'
import { useActiveProject } from '../../state/workspace.queries'
import { useTrackerStore } from './tracker.store'
import type { TrackerUndo, TrackerApplied } from './tracker.types'

/** Чем было удалённое правкой: подпись карточки «Undo». */
const undoKindOf = (op: TrackerOp): Exclude<NonNullable<TrackerUndo>['kind'], 'repeat'> | null =>
  op.kind === 'card.delete'
    ? 'card'
    : op.kind === 'group.delete'
      ? 'group'
      : op.kind === 'flow.delete'
        ? 'flow'
        : null

/**
 * Правки доски открытого проекта. Ответ главного процесса - новая доска, она сразу в кэш; отказ
 * - уведомлением в углу. Удаление карточки, группы или потока и отметка «сделано» у
 * повторяющейся карточки предлагают «Undo».
 */
export const useTrackerActions = () => {
  const project = useActiveProject()
  const queryClient = useQueryClient()
  const fail = useTrackerStore((state) => state.fail)
  const offerUndo = useTrackerStore((state) => state.offerUndo)
  const sent = useTrackerStore((state) => state.sent)
  const put = (board: TrackerBoard) =>
    queryClient.setQueryData(QUERY_KEYS.trackerBoard(board.projectPath), board)

  /**
   * Правка доски открытого проекта или названного (projectId - «Undo» в проекте, где удаляли);
   * ответ - удалась ли, id созданного и новая доска.
   */
  const apply = async (op: TrackerOp, projectId = project?.id): Promise<TrackerApplied> => {
    if (!projectId) return { ok: false, created: null, board: null }

    const outcome = await invoke('tracker:apply', { projectId, op })

    if (!outcome.ok) {
      fail(outcome.code)

      return { ok: false, created: null, board: null }
    }

    put(outcome.board)

    const kind = undoKindOf(op)

    if (kind && outcome.removed.length > 0) offerUndo({ ids: outcome.removed, kind, projectId })
    if (outcome.repeated)
      offerUndo({
        kind: 'repeat',
        due: outcome.repeated.due,
        ops: outcome.repeated.undo,
        projectId,
      })

    return { ok: true, created: outcome.created, board: outcome.board }
  }

  /** Отправка в очередь сценариев; ответ - id очереди или null при отказе. */
  const send = async (request: TrackerSendRequest): Promise<string | null> => {
    if (!project) return null

    const outcome = await invoke('tracker:send', { projectId: project.id, ...request })

    if (!outcome.ok) {
      fail(outcome.code)

      return null
    }

    put(outcome.board)
    sent(outcome.sent.length)

    return outcome.queueId
  }

  return { apply, send }
}
