import type { QueueAction, QueueTarget } from '@shared/scenario-queues'
import { missingInputs } from '@shared/scenario-rules'

import { numberArg, stringArg, booleanArg, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { scopeOf } from '../../../scenarios/store/scenario-parse'
import { queueView } from './queue-views'
import {
  hoursArg,
  oneOfArg,
  HOURS_ARG,
  inputsArg,
  projectOf,
  listScopeOf,
  PROJECT_ARG,
  unattendedProviderArg,
} from './workstation-args'
import { checkScenario, scenarioError } from './workstation-words'

const QUEUE_ACTIONS = [
  'stop_after',
  'clear_stop_after',
  'resume',
  'remove_item',
  'move_item',
  'mark_done',
  'rename',
  'clear_waiting',
  'set_hours',
  'clear_hours',
  'close',
] as const

const itemOf = (args: Record<string, unknown>) => stringArg(args, 'item_id', true)

/** Действие с очередью по слову модели - то же, что кнопки карточки очереди. */
const queueActionOf = (args: Record<string, unknown>): QueueAction => {
  const action = oneOfArg(args, 'action', QUEUE_ACTIONS)

  switch (action) {
    case 'stop_after':
      return { kind: 'stopAfter', itemId: itemOf(args) }
    case 'clear_stop_after':
      return { kind: 'stopAfter', itemId: null }
    case 'resume':
      return { kind: 'resume' }
    case 'remove_item':
      return { kind: 'remove', itemId: itemOf(args) }
    case 'move_item':
      return {
        kind: 'move',
        itemId: itemOf(args),
        by: numberArg(args, 'by', { min: -100, max: 100, fallback: 0 }),
      }
    case 'mark_done':
      return { kind: 'markDone', itemId: itemOf(args) }
    case 'rename':
      return { kind: 'rename', name: stringArg(args, 'name', true) }
    case 'clear_waiting':
      return { kind: 'clear' }
    case 'set_hours': {
      const hours = hoursArg(args, 'hours')

      if (!hours) throw new ArgumentError('"hours" is required for set_hours')

      return { kind: 'hours', hours }
    }
    case 'clear_hours':
      return { kind: 'hours', hours: null }
    case 'close':
      return { kind: 'close' }
  }
}

/** Очереди сценариев: посмотреть, поставить сценарий, править очередь. */
export const QUEUE_TOOLS: NativeTool<WorkstationPorts>[] = [
  {
    name: 'list_queues',
    description:
      'Scenario queues: their items in order (waiting, running, done, failed, stopped, skipped), where they stop, their working hours and the run going now. Open queues of a project, or of every project. A placeholder item is a tracker card without a scenario sent with its group: it runs nothing, the queue passes it (skipped) when it gets there.',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        all_projects: { type: 'boolean', description: 'Queues of every project. Default false.' },
      },
    },
    run: (args, ports, call) => {
      const view = ports.scenarios.queuesView()
      const path = listScopeOf(args, call, ports.projects)
      const queues = view.queues.filter((queue) => !path || queue.projectPath === path)

      return Promise.resolve({ queues: queues.map((queue) => queueView(queue, view.live)) })
    },
  },
  {
    name: 'start_scenario',
    description: [
      'Put a scenario into a queue: a new queue (it starts at once unless hours say otherwise) or the end of an existing one (queue_id). Inside a queue scenarios go one at a time, each after the one before is done.',
      'To build a queue that waits, start the first scenario with hours in a new queue - outside them the queue sleeps and starts by itself when they begin - then add the rest with queue_id.',
    ].join(' '),
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        scenario_id: { type: 'string', description: 'Scenario id from list_scenarios.' },
        scope: { type: 'string', enum: ['project', 'user'], description: 'Default project.' },
        inputs: { type: 'object', description: 'Answers to the inputs: name -> text.' },
        provider: {
          type: 'string',
          description:
            'claude, codex, kimi or opencode (antigravity works only in its own chat). Default: the provider the scenario is written for.',
        },
        queue_id: { type: 'string', description: 'Add to the end of this queue.' },
        worktree: {
          type: 'boolean',
          description:
            'New queue only: work in its own git worktree. Default false (the project folder).',
        },
        hours: { ...HOURS_ARG, description: `New queue only. ${HOURS_ARG.description}` },
      },
      required: ['scenario_id'],
    },
    run: async (args, ports, call) => {
      const path = projectOf(args, call, ports.projects)
      const scope = scopeOf(args['scope'])
      const scenario = await ports.scenarios.fetch(
        path,
        stringArg(args, 'scenario_id', true),
        scope,
      )

      if (!scenario) throw scenarioError('scenarioGone')

      const inputs = inputsArg(args)
      const missing = missingInputs(scenario, inputs)

      if (missing.length) throw new ArgumentError(`Answer the inputs: ${missing.join(', ')}.`)

      const queueId = stringArg(args, 'queue_id')
      const target: QueueTarget = queueId
        ? { kind: 'queue', queueId }
        : { kind: 'new', worktree: booleanArg(args, 'worktree', false) }
      const started = await ports.scenarios.start({
        projectPath: path,
        scenarioId: scenario.id,
        scope,
        inputs,
        provider: unattendedProviderArg(args) ?? scenario.head.provider,
        target,
        hours: queueId ? null : hoursArg(args, 'hours'),
      })

      if (!started.ok) throw scenarioError(started.code, started.detail)

      const view = ports.scenarios.queuesView()
      const queue = view.queues.find((one) => one.id === started.queueId)

      return {
        queueId: started.queueId,
        itemId: started.itemId,
        queue: queue ? queueView(queue, view.live) : null,
      }
    },
  },
  {
    name: 'update_queue',
    description: [
      'Change a queue like its card does: stop_after (item_id; the queue stops after that item; not a placeholder - the queue passes those), clear_stop_after, resume (lift a stop; an unfinished item continues its run), remove_item, move_item (by: -1 up, 1 down), mark_done (a failed or stopped item the person finished by hand),',
      'rename (name), clear_waiting (drop every waiting item), set_hours (hours), clear_hours (work any time), close (the queue goes to history).',
    ].join(' '),
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        queue_id: { type: 'string' },
        action: { type: 'string', enum: [...QUEUE_ACTIONS] },
        item_id: { type: 'string' },
        by: { type: 'number' },
        name: { type: 'string' },
        hours: HOURS_ARG,
      },
      required: ['queue_id', 'action'],
    },
    run: async (args, ports) => {
      const queueId = stringArg(args, 'queue_id', true)
      const action = queueActionOf(args)
      const target =
        action.kind === 'stopAfter' && action.itemId
          ? ports.scenarios
              .queuesView()
              .queues.find((one) => one.id === queueId)
              ?.items.find((item) => item.id === action.itemId)
          : null

      // Очередь проходит мимо пометки, не останавливаясь: без отказа агент решил бы, что встанет.
      if (target?.placeholder) {
        throw new ArgumentError(
          'This item is a placeholder (a tracker card without a scenario): the queue passes it and cannot stop after it. Stop after a scenario item.',
        )
      }

      checkScenario(await ports.scenarios.act(queueId, action))

      const view = ports.scenarios.queuesView()
      const queue = view.queues.find((one) => one.id === queueId)

      return { queue: queue ? queueView(queue, view.live) : null }
    },
  },
]
