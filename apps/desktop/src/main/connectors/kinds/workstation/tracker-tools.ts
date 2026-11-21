import type { TrackerOp } from '@shared/tracker'

import { stringArg } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { noMove, present, textArg, savedView, trackerPlaceOf } from './tracker-args'
import { TRACKER_CARD_TOOLS } from './tracker-card-tools'
import { TRACKER_MOVE_TOOLS } from './tracker-move-tools'
import { boardView } from './tracker-views'
import { PROJECT_ARG } from './workstation-args'
import { trackerError } from './workstation-words'

const idArg = (what: string) => ({
  type: 'string',
  description: `The ${what} to change (give only what changes). Without it a new one is made.`,
})

/** Поток или группа: оба - заголовок и подзаголовок под родителем; новый встаёт в его конец. */
const branchTool = (
  kind: 'flow' | 'group',
  parentKey: 'tracker_project_id' | 'flow_id',
  description: string,
): NativeTool<WorkstationPorts> => ({
  name: `tracker_save_${kind}`,
  description,
  access: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      project: PROJECT_ARG,
      id: idArg(kind),
      [parentKey]: { type: 'string', description: `New ${kind} only: where it goes (at the end).` },
      title: { type: 'string' },
      subtitle: { type: 'string' },
    },
  },
  run: (args, ports, call) => {
    const id = stringArg(args, 'id')
    const text = present({ title: textArg(args, 'title'), subtitle: textArg(args, 'subtitle') })

    if (id) {
      noMove(args, [parentKey])

      return savedView(args, call, ports, { kind: `${kind}.update`, id, ...text })
    }

    const parent = stringArg(args, parentKey, true)
    // Пустой заголовок отклоняет правка трекера - словами badTitle, а не «нужна строка».
    const title = textArg(args, 'title') ?? ''
    const op: TrackerOp =
      kind === 'flow'
        ? { kind: 'flow.create', projectId: parent, ...text, title }
        : { kind: 'group.create', flowId: parent, ...text, title }

    return savedView(args, call, ports, op)
  },
})

/**
 * Трекер задач (ADR 0101): доска проекта IDE и её правка - проекты трекера, потоки, группы,
 * карточки, перенос, удаление и отправка карточек в очередь сценариев.
 */
export const TRACKER_TOOLS: NativeTool<WorkstationPorts>[] = [
  {
    name: 'tracker_board',
    description: [
      'The task tracker of a project: tracker projects (tabs) hold flows; a flow holds groups (columns, in work order); a group holds tasks (cards, top-down); a task may have follow-ups (cards that come after it, in a chain).',
      'A card may be bound to a scenario: sent to a queue (tracker_send_to_queue) it runs that scenario with the card text and is marked done when its queue item is done.',
      'Ids here are what the other tracker_* tools take. Empty fields are left out; priority 1 is most urgent, 4 none; done shows only when true; due is local time; run is the queue item of the card on this computer.',
    ].join(' '),
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        tracker_project_id: { type: 'string', description: 'Only this tracker project.' },
      },
    },
    run: async (args, ports, call) => {
      const board = await ports.tracker.board(trackerPlaceOf(args, call, ports))
      const only = stringArg(args, 'tracker_project_id')

      if (only && ![...board.projects, ...board.archived].some((one) => one.id === only))
        throw trackerError('notFound', 'tracker_project_id')

      return boardView(board, only)
    },
  },
  {
    name: 'tracker_save_project',
    description:
      'Create a tracker project (a tab of the board; a new one goes last) or change its title or description.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        id: idArg('tracker project'),
        title: { type: 'string' },
        description: { type: 'string' },
      },
    },
    run: (args, ports, call) => {
      const id = stringArg(args, 'id')
      const description = textArg(args, 'description')
      const op: TrackerOp = id
        ? { kind: 'project.update', id, ...present({ title: textArg(args, 'title'), description }) }
        : {
            kind: 'project.create',
            title: textArg(args, 'title') ?? '',
            description: description ?? '',
          }

      return savedView(args, call, ports, op)
    },
  },
  branchTool(
    'flow',
    'tracker_project_id',
    'Create a flow (a row of groups inside a tracker project) or change its title or subtitle.',
  ),
  branchTool(
    'group',
    'flow_id',
    'Create a group (a column of tasks inside a flow; groups go left to right in work order) or change its title or subtitle.',
  ),
  ...TRACKER_CARD_TOOLS,
  ...TRACKER_MOVE_TOOLS,
]
