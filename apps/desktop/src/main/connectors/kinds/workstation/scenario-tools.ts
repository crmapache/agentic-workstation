import { isRunnable } from '@shared/scenario-rules'
import { SCENARIO_SCOPES, SCENARIO_REPEATS } from '@shared/scenarios'

import { stringArg, booleanArg, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { parseScenario } from '../../../scenarios/store/scenario-parse'
import { withIds, scopeArg, checkModes, weekdayArg, shelfToSave } from './scenario-saving'
import {
  timeOf,
  clockOf,
  oneOfArg,
  inputsArg,
  minutesOf,
  projectOf,
  recordArg,
  PROJECT_ARG,
  unattendedProviderArg,
} from './workstation-args'
import { checkScenario, scenarioError } from './workstation-words'

const SCOPE_ARG = {
  type: 'string',
  enum: [...SCENARIO_SCOPES],
  description:
    'Shelf: project (.claude/scenarios of the repository) or user (personal). Default: project.',
}

const SCENARIO_ID_ARG = { type: 'string', description: 'Scenario id from list_scenarios.' }

/** Полки сценариев проекта: что есть, целиком, запись, удаление и расписание запусков. */
export const SCENARIO_TOOLS: NativeTool<WorkstationPorts>[] = [
  {
    name: 'list_scenarios',
    description:
      'Scenarios of a project (both shelves) with the inputs each asks before a run, their scheduled runs and the latest runs of the project.',
    access: 'read',
    inputSchema: { type: 'object', properties: { project: PROJECT_ARG } },
    run: async (args, ports, call) => {
      const view = await ports.scenarios.shelves(projectOf(args, call, ports.projects))

      return {
        scenarios: view.scenarios.map((scenario) => ({
          id: scenario.id,
          scope: scenario.scope,
          name: scenario.name,
          provider: scenario.head.provider,
          inputs: scenario.inputs.map(({ name, label, required, placeholder }) => ({
            name,
            label,
            required,
            ...(placeholder && { placeholder }),
          })),
          stages: scenario.stages.map((stage) => stage.title),
          runnable: isRunnable(scenario),
        })),
        schedules: view.schedules.map((hour) => ({
          id: hour.id,
          scenarioId: hour.scenarioId,
          scope: hour.scope,
          at: clockOf(hour.at),
          repeat: hour.repeat,
          ...(hour.repeat === 'weekly' && { weekday: hour.weekday }),
          inputs: hour.inputs,
          provider: hour.provider,
          worktree: hour.worktree,
          next: timeOf(hour.nextAt),
        })),
        latestRuns: view.runs.slice(0, 10).map((run) => ({
          runId: run.id,
          scenario: run.scenarioName,
          state: run.state,
          queueId: run.queueId,
          started: timeOf(run.startedAt),
          finished: timeOf(run.finishedAt),
          inputs: run.inputs,
        })),
      }
    },
  },
  {
    name: 'get_scenario',
    description:
      'A scenario in full: head settings, stages and their cards with prompts. Read it before editing with save_scenario.',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: { project: PROJECT_ARG, scenario_id: SCENARIO_ID_ARG, scope: SCOPE_ARG },
      required: ['scenario_id'],
    },
    run: async (args, ports, call) => {
      const path = projectOf(args, call, ports.projects)
      const scenario = await ports.scenarios.fetch(
        path,
        stringArg(args, 'scenario_id', true),
        scopeArg(args),
      )

      if (!scenario) throw scenarioError('scenarioGone')

      return scenario
    },
  },
  {
    name: 'save_scenario',
    description: [
      'Create a scenario or replace one: the whole scenario object in the shape get_scenario returns (version, id, name, inputs, head, stages with cards).',
      'An existing id replaces that scenario; no id makes a new one. Missing ids of stages, cards, inputs and slots are filled in.',
      'Inputs appear in card prompts as {{name}}, slots as [[name]].',
      'permissionMode of the head and cards: default or plan; modes that act without asking only the person sets, in the scenario editor (modes the scenario already has stay).',
    ].join(' '),
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        scope: {
          ...SCOPE_ARG,
          description:
            'Shelf to save on. Default: the shelf in the scenario object, or where a scenario with this id already is, else project. Naming another shelf moves it there.',
        },
        scenario: { type: 'object', description: 'The scenario.' },
      },
      required: ['scenario'],
    },
    run: async (args, ports, call) => {
      const path = projectOf(args, call, ports.projects)
      const raw = recordArg(args, 'scenario')
      const scope = await shelfToSave(args, raw, path, ports)
      const parsed = parseScenario(raw, scope)

      if (!parsed) throw new ArgumentError('"scenario" must be an object')

      await checkModes(parsed, path, ports)

      const saved = await ports.scenarios.save(path, withIds(parsed), scope)

      if (!saved.ok) throw scenarioError(saved.code)

      return { id: saved.scenario.id, scope: saved.scenario.scope, name: saved.scenario.name }
    },
  },
  {
    name: 'delete_scenario',
    description: 'Delete a scenario from its shelf. Its past runs stay in the history.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: { project: PROJECT_ARG, scenario_id: SCENARIO_ID_ARG, scope: SCOPE_ARG },
      required: ['scenario_id'],
    },
    run: async (args, ports, call) => {
      const path = projectOf(args, call, ports.projects)

      checkScenario(
        await ports.scenarios.delete(path, stringArg(args, 'scenario_id', true), scopeArg(args)),
      )

      return { deleted: true }
    },
  },
  {
    name: 'schedule_scenario',
    description:
      'Schedule runs of a scenario at a time of day: once, daily, on weekdays or weekly. Each run starts a new queue. Give schedule_id to change an existing schedule.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        scenario_id: SCENARIO_ID_ARG,
        scope: SCOPE_ARG,
        schedule_id: { type: 'string', description: 'Existing schedule to change.' },
        at: { type: 'string', description: 'HH:MM, local time of this computer.' },
        repeat: { type: 'string', enum: [...SCENARIO_REPEATS] },
        weekday: { type: 'number', description: 'For weekly: 1 Monday ... 7 Sunday.' },
        inputs: { type: 'object', description: 'Answers to the inputs of the scenario.' },
        provider: {
          type: 'string',
          description:
            'claude, codex, kimi or opencode (antigravity works only in its own chat). Default: the scenario provider.',
        },
        worktree: {
          type: 'boolean',
          description: 'Run each in its own git worktree. Default false.',
        },
      },
      required: ['scenario_id', 'at', 'repeat'],
    },
    run: async (args, ports, call) => {
      const path = projectOf(args, call, ports.projects)
      const scope = scopeArg(args)
      const scenarioId = stringArg(args, 'scenario_id', true)
      const scenario = await ports.scenarios.fetch(path, scenarioId, scope)

      if (!scenario) throw scenarioError('scenarioGone')

      checkScenario(
        await ports.scenarios.schedule(path, {
          scenarioId,
          scope,
          scheduleId: stringArg(args, 'schedule_id') ?? '',
          at: minutesOf(args['at'], 'at'),
          repeat: oneOfArg(args, 'repeat', SCENARIO_REPEATS),
          weekday: weekdayArg(args),
          inputs: inputsArg(args),
          worktree: booleanArg(args, 'worktree', false),
          provider: unattendedProviderArg(args) ?? scenario.head.provider,
        }),
      )

      return { scheduled: true }
    },
  },
  {
    name: 'unschedule_scenario',
    description: 'Remove a scheduled run (id from list_scenarios).',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: { project: PROJECT_ARG, schedule_id: { type: 'string' } },
      required: ['schedule_id'],
    },
    run: async (args, ports, call) => {
      const path = projectOf(args, call, ports.projects)

      checkScenario(await ports.scenarios.unschedule(path, stringArg(args, 'schedule_id', true)))

      return { removed: true }
    },
  },
]
