import type { TrackerOp, TrackerBoard, TrackerSendCode, TrackerSendRequest } from '@shared/tracker'
import { TRACKER_ARCHIVE_DAYS } from '@shared/tracker'

import { stringArg, booleanArg, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { TrackerPlace } from '../../../tracker/tracker-spaces'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { applied, checkBefore, trackerPlaceOf } from './tracker-args'
import type { Slot } from './tracker-views'
import { locate, cardsOf, slotOrder } from './tracker-views'
import { timeOf, hoursArg, oneOfArg, HOURS_ARG, PROJECT_ARG } from './workstation-args'
import { trackerSendError } from './workstation-words'

const KINDS = ['project', 'flow', 'group', 'card'] as const

type Kind = (typeof KINDS)[number]

/** Куда можно перенести запись каждого вида: остальные аргументы места - ошибка модели. */
const TARGETS: Record<Kind, readonly string[]> = {
  project: [],
  flow: ['tracker_project_id'],
  group: ['flow_id'],
  card: ['group_id', 'follow_up_of'],
}

const TARGET_KEYS = ['tracker_project_id', 'flow_id', 'group_id', 'follow_up_of']

const KIND_ARG = { type: 'string', enum: [...KINDS] }

/**
 * Правка переноса и место, куда встаёт запись. Не названное место - нынешнее: поток остаётся в
 * своём проекте, карточка - задачей своей группы или продолжением своей цепочки.
 */
const moveOf = (
  args: Record<string, unknown>,
  kind: Kind,
  id: string,
  board: TrackerBoard,
): { op: TrackerOp; slot: Slot } => {
  const here = locate(board, id)
  const beforeId = stringArg(args, 'before_id') ?? null
  const parentOr = (key: string) => stringArg(args, key) ?? here?.parentId ?? ''

  switch (kind) {
    case 'project':
      return { op: { kind: 'project.move', id, beforeId }, slot: { kind: 'project' } }
    case 'flow': {
      const projectId = parentOr('tracker_project_id')

      return {
        op: { kind: 'flow.move', id, projectId, beforeId },
        slot: { kind: 'flow', parentId: projectId },
      }
    }
    case 'group': {
      const flowId = parentOr('flow_id')

      return {
        op: { kind: 'group.move', id, flowId, beforeId },
        slot: { kind: 'group', parentId: flowId },
      }
    }
    case 'card': {
      const groupId = stringArg(args, 'group_id')
      const chain = stringArg(args, 'follow_up_of') ?? (groupId ? null : (here?.chainOf ?? null))

      if (groupId && chain)
        throw new ArgumentError(
          'Give group_id (it becomes a task of that group) or follow_up_of (it joins that task chain), not both.',
        )

      const group = chain ? '' : (groupId ?? here?.parentId ?? '')

      return {
        op: { kind: 'card.move', id, groupId: group, followUpOf: chain, beforeId },
        slot: chain ? { kind: 'followUp', cardId: chain } : { kind: 'task', parentId: group },
      }
    }
  }
}

/** Карточки группы по порядку отправки и почему какие-то в очередь не пошли. */
const skippedOf = (board: TrackerBoard, groupId: string, sent: readonly string[]) =>
  cardsOf(board)
    .filter((card) => locate(board, card.id)?.parentId === groupId && !sent.includes(card.id))
    .map((card) => ({
      id: card.id,
      why: card.done
        ? 'done'
        : !card.scenario
          ? 'no scenario'
          : card.run?.state === 'waiting' || card.run?.state === 'running'
            ? 'already in a queue'
            : 'not sent',
    }))

/**
 * Отказ отправки словами: на какой карточке встала и что успело уйти. Очередь проверяет все
 * карточки до первой, но постановка может отказать и посреди (очередь занята, worktree не встал).
 */
const sendRefusal = async (
  ports: WorkstationPorts,
  place: TrackerPlace,
  before: TrackerBoard,
  refusal: { code: TrackerSendCode; cardId: string | null },
) => {
  const was = new Map(cardsOf(before).map((card) => [card.id, card.run?.itemId]))
  const sentNow = cardsOf(await ports.tracker.board(place)).filter(
    (card) => card.run && card.run.itemId !== was.get(card.id),
  )
  const card = cardsOf(before).find((one) => one.id === refusal.cardId)
  const words = trackerSendError(refusal.code, card && `Card ${card.id} "${card.title}"`).message
  const tail = sentNow[0]?.run
    ? ` Sent before it, they stay in queue ${sentNow[0].run.queueId}: ${sentNow.map((one) => one.id).join(', ')}.`
    : ' Nothing was sent.'

  return new ArgumentError(words + tail)
}

/** Перенос, удаление и возврат из архива; отправка карточек в очередь сценариев. */
export const TRACKER_MOVE_TOOLS: NativeTool<WorkstationPorts>[] = [
  {
    name: 'tracker_move',
    description: [
      'Move a tracker project, flow, group or card; before_id puts it before that sibling, without it - last.',
      'A flow can go to another tracker project, a group to another flow; a card becomes a task of a group (group_id) or a follow-up in a task chain (follow_up_of) - a task moves with its follow-ups. Without a target it stays where it is and only changes order.',
    ].join(' '),
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        kind: KIND_ARG,
        id: { type: 'string' },
        before_id: { type: 'string' },
        tracker_project_id: { type: 'string', description: 'Flow: the tracker project to go to.' },
        flow_id: { type: 'string', description: 'Group: the flow to go to.' },
        group_id: { type: 'string', description: 'Card: becomes a task of this group.' },
        follow_up_of: { type: 'string', description: 'Card: joins the chain of this task.' },
      },
      required: ['kind', 'id'],
    },
    run: async (args, ports, call) => {
      const kind = oneOfArg(args, 'kind', KINDS)
      const id = stringArg(args, 'id', true)
      const stray = TARGET_KEYS.filter(
        (key) => args[key] !== undefined && !TARGETS[kind].includes(key),
      )

      if (stray.length > 0)
        throw new ArgumentError(`${stray.join(', ')}: not a place for a ${kind}.`)

      const place = trackerPlaceOf(args, call, ports)
      const board = await ports.tracker.board(place)
      const { op, slot } = moveOf(args, kind, id, board)

      checkBefore(board, 'beforeId' in op ? op.beforeId : null, slot, id)

      const outcome = await applied(ports, place, op)

      return { moved: id, order: slotOrder(outcome.board, slot) }
    },
  },
  {
    name: 'tracker_delete',
    description: `Delete from the board. A tracker project goes to the archive: restorable with tracker_restore_project for ${TRACKER_ARCHIVE_DAYS} days, then deleted for good. A flow, group or card is deleted at once with everything in it (a task with its follow-ups) and you cannot bring it back - mark finished cards done instead.`,
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: { project: PROJECT_ARG, kind: KIND_ARG, id: { type: 'string' } },
      required: ['kind', 'id'],
    },
    run: async (args, ports, call) => {
      const kind = oneOfArg(args, 'kind', KINDS)
      const id = stringArg(args, 'id', true)
      const place = trackerPlaceOf(args, call, ports)

      if (kind !== 'project') {
        const outcome = await applied(ports, place, { kind: `${kind}.delete`, id })

        return { deleted: outcome.removed }
      }

      const outcome = await applied(ports, place, { kind: 'project.archive', id })
      const archived = outcome.board.archived.find((one) => one.id === id)

      return {
        archived: id,
        purge_at: archived ? timeOf(archived.purgeAt) : '',
        note: 'Restorable with tracker_restore_project until purge_at.',
      }
    },
  },
  {
    name: 'tracker_restore_project',
    description: 'Bring an archived tracker project back from the archive, as the last tab.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: { project: PROJECT_ARG, id: { type: 'string' } },
      required: ['id'],
    },
    run: async (args, ports, call) => {
      const id = stringArg(args, 'id', true)
      const outcome = await applied(ports, trackerPlaceOf(args, call, ports), {
        kind: 'project.restore',
        id,
      })

      return { restored: id, title: outcome.board.projects.find((one) => one.id === id)?.title }
    },
  },
  {
    name: 'tracker_send_to_queue',
    description: [
      'Send cards to a scenario queue: a whole group (group_id: its tasks top-down, each followed by its follow-ups; cards done, without a scenario or already waiting or running in a queue are skipped) or one card (card_id).',
      'Each card runs its scenario with the card text; a card whose queue item is done gets marked done (a repeating card moves to its next due instead).',
      'Into a new queue named after the group (worktree and working hours optional) or the end of an existing one (queue_id from list_queues). All cards are checked before the first one goes.',
    ].join(' '),
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        group_id: { type: 'string' },
        card_id: { type: 'string' },
        queue_id: { type: 'string', description: 'Add to the end of this queue.' },
        worktree: {
          type: 'boolean',
          description: 'New queue only: work in its own git worktree. Default false.',
        },
        hours: { ...HOURS_ARG, description: `New queue only. ${HOURS_ARG.description}` },
      },
    },
    run: async (args, ports, call) => {
      const groupId = stringArg(args, 'group_id')

      if (Boolean(groupId) === Boolean(stringArg(args, 'card_id')))
        throw new ArgumentError('Give group_id or card_id - one of them.')

      const queueId = stringArg(args, 'queue_id')
      const request: TrackerSendRequest = {
        source: groupId
          ? { kind: 'group', groupId }
          : { kind: 'card', cardId: stringArg(args, 'card_id', true) },
        target: queueId
          ? { kind: 'queue', queueId }
          : { kind: 'new', worktree: booleanArg(args, 'worktree', false) },
        hours: queueId ? null : hoursArg(args, 'hours'),
      }
      const place = trackerPlaceOf(args, call, ports)
      const before = await ports.tracker.board(place)
      const outcome = await ports.tracker.send(place, request)

      if (!outcome.ok) throw await sendRefusal(ports, place, before, outcome)

      const skipped = groupId ? skippedOf(before, groupId, outcome.sent) : []

      return {
        queue_id: outcome.queueId,
        sent: outcome.sent,
        ...(skipped.length > 0 && { skipped }),
      }
    },
  },
]
