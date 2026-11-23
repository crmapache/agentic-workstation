import type { TrackerOp } from '@shared/tracker'
import { cardIdOf } from '@shared/tracker-link'

import { stringArg, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { noMove, present, textArg, savedView, placeOfPath, trackerPlaceOf } from './tracker-args'
import { TRACKER_CARD_TOOLS } from './tracker-card-tools'
import { TRACKER_MOVE_TOOLS } from './tracker-move-tools'
import { boardView, cardPlaceView } from './tracker-views'
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
      'The task tracker of a project: tracker projects (tabs) hold flows; a flow holds groups (columns left to right in work order: the leftmost is done first, a new group goes last, on the right); a group holds tasks (cards, top-down); a task may have follow-ups (cards to its right, in a chain).',
      'Laying out work: the steps of one piece of work are tasks of one group, in order - a new sequence gets its own group in the flow it belongs to. A follow-up is not a step of its task but what to do after it is done, like checking later, once new data comes in, that it really worked (give it a due if the time is known).',
      "Tracker projects and flows are the user's: put cards into the ones that fit. If no flow fits, suggest a new one and make it only after the user agrees; suggest a new tracker project only for a very weighty reason - the user makes those.",
      'A card may be bound to a scenario: sent to a queue (tracker_send_to_queue) it runs that scenario with the card text and is marked done when its queue item is done (a repeating card moves to its next due instead - do not mark it done again).',
      'Ids here are what the other tracker_* tools take. Empty fields are left out; priority 1 is most urgent, 4 none; done shows only when true; due is local time; run is the queue item of the card on this computer.',
      'locked: run - the scenario of the card is queued or running, locked: done - it has done the card; a locked card takes only description and done.',
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
    name: 'tracker_card',
    description: [
      'One tracker card by its link aw://tracker/card/<id> or its id: the user puts such links into the chat to point at a card (to implement it, to discuss it).',
      'Gives the card (a task with its follow-ups, a follow-up with the task it follows), its link and where it lies: project_path, tracker project, flow and group.',
      'The card is looked for on every board this conversation may see, its own project first; project narrows it to one board.',
      'To change the card, pass its id and its project_path as project to the other tracker_* tools.',
    ].join(' '),
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        card: { type: 'string', description: 'The link aw://tracker/card/<id> or the card id.' },
        project: PROJECT_ARG,
      },
      required: ['card'],
    },
    run: async (args, ports, call) => {
      const id = cardIdOf(stringArg(args, 'card', true))
      const own = call.launch?.projectPath
      // Без проекта - только доски, где карточка правда лежит: board завёл бы доску каждому.
      const places =
        args['project'] === undefined
          ? ports.tracker
              .pathsOf(id)
              .sort((a, b) => Number(b === own) - Number(a === own))
              .map((path) => placeOfPath(path, ports))
          : [trackerPlaceOf(args, call, ports)]

      for (const place of places) {
        const view = cardPlaceView(await ports.tracker.board(place), id)

        if (view) return view
      }

      throw new ArgumentError(
        'card: no such card on the boards this conversation may see - it was deleted, or its project is closed to this conversation.',
      )
    },
  },
  {
    name: 'tracker_save_project',
    description: [
      'Create a tracker project (a tab of the board; a new one goes last) or change its title or description.',
      'Make a new one only when the user asks for it or agrees to it: the user makes tracker projects, so suggest one only for a very weighty reason, and put work into the existing ones.',
    ].join(' '),
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
    [
      'Create a flow (a row of groups inside a tracker project) or change its title or subtitle.',
      'Make a new one only when the user asks for it or agrees to your suggestion: put work into the flow that fits, and if none does, suggest one first.',
    ].join(' '),
  ),
  branchTool(
    'group',
    'flow_id',
    [
      'Create a group (a column of tasks inside a flow; groups go left to right in work order, the first to do on the left; a new one goes last) or change its title or subtitle.',
      'A group is one piece of work, its tasks are the steps in order: a new sequence of steps gets its own group without asking.',
    ].join(' '),
  ),
  ...TRACKER_CARD_TOOLS,
  ...TRACKER_MOVE_TOOLS,
]
