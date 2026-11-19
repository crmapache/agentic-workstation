import { stringArg, booleanArg, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { ASK_TOOL } from '../../../scenarios/engine/run-mail'
import { runView, runProjectOf } from './queue-views'
import { oneOfArg, PROJECT_ARG } from './workstation-args'
import { checkScenario, scenarioError } from './workstation-words'

const RUN_ACTIONS = ['pause', 'resume', 'stop', 'continue', 'tell', 'answer'] as const

/** Прогоны сценариев: прочитать и вести - пауза, стоп, слово голове, ответ на её вопрос. */
export const RUN_TOOLS: NativeTool<WorkstationPorts>[] = [
  {
    name: 'get_scenario_run',
    description:
      'A scenario run: its state, steps (cards) with what they said, the question it waits on, failure and cost.',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' }, project: PROJECT_ARG },
      required: ['run_id'],
    },
    run: async (args, ports, call) => {
      const runId = stringArg(args, 'run_id', true)
      const run = await ports.scenarios.run(runProjectOf(ports, runId, args, call), runId)

      if (!run) throw scenarioError('runGone')

      return runView(run)
    },
  },
  {
    name: 'scenario_run_action',
    description:
      'Steer a scenario run: pause, resume, stop; continue (pick a stopped run up where it stopped); tell (text to its head); answer the question it waits on (text). A permission it waits on only the person can allow; you can deny it (allow false, text says why).',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        action: { type: 'string', enum: [...RUN_ACTIONS] },
        text: { type: 'string' },
        allow: { type: 'boolean' },
        project: PROJECT_ARG,
      },
      required: ['run_id', 'action'],
    },
    run: async (args, ports, call) => {
      const runId = stringArg(args, 'run_id', true)
      const action = oneOfArg(args, 'action', RUN_ACTIONS)

      if (action === 'continue') {
        checkScenario(await ports.scenarios.carryOn(runId))

        return { done: true }
      }

      const path = runProjectOf(ports, runId, args, call)
      const run = await ports.scenarios.run(path, runId)

      if (!run) throw scenarioError('runGone')

      if (action === 'tell') {
        const told = ports.scenarios.tell(path, runId, stringArg(args, 'text', true), [])

        if (!told) throw scenarioError('runOver')

        return { told: true }
      }

      if (action === 'answer') {
        const asked = run.question

        if (!asked) throw new ArgumentError('The run is not waiting on a question.')

        const allow = booleanArg(args, 'allow', true)

        // Разрешение действия карточки даёт только человек: сценарий сказал спрашивать его, и
        // агент снаружи не берёт это на себя. Отказать и ответить словами - можно.
        if (allow && asked.tool !== ASK_TOOL) {
          throw new ArgumentError(
            `Only the person allows ${asked.tool} for a run: ask them, or answer with allow false and say why.`,
          )
        }

        const answered = ports.scenarios.answer(path, runId, allow, stringArg(args, 'text') ?? '', {
          stepKey: asked.stepKey,
          askedAt: asked.askedAt,
        })

        if (!answered) throw new ArgumentError('The question is gone: the run moved on.')

        return { answered: true }
      }

      const refusal = ports.scenarios.control(path, runId, action, run.state)

      if (refusal === 'runMoved') {
        throw new ArgumentError('The run changed just now: look at it again and retry.')
      }

      if (refusal) throw scenarioError('runOver')

      return { done: true }
    },
  },
]
