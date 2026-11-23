import { basename } from 'node:path'

import { SCENARIO_SCOPES } from '@shared/scenarios'
import type {
  TrackerOp,
  TrackerDue,
  TrackerBoard,
  TrackerPriority,
  TrackerScenario,
  TrackerCardFields,
} from '@shared/tracker'
import { TRACKER_PRIORITIES } from '@shared/tracker'

import { stringArg, ArgumentError } from '../native-tools'
import type { NativeCall } from '../native-tools'
import type { TrackerPlace } from '../../../tracker/tracker-spaces'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { repeatArg, autoRunArg, REPEAT_FIELDS_SCHEMA } from './tracker-repeat-args'
import type { Slot } from './tracker-views'
import { locate, dueText, slotOrder } from './tracker-views'
import {
  oneOfArg,
  inputsArg,
  projectOf,
  recordArg,
  unattendedProviderArg,
} from './workstation-args'
import { trackerError, scenarioError } from './workstation-words'

/**
 * Аргументы инструментов трекера (ADR 0101): место доски и поля карточки словами модели. Тип и
 * форма проверяются здесь, чтобы отказ говорил, какой аргумент не тот; настоящая ли дата и не
 * длинен ли текст - решает правка трекера, её отказ уходит словами workstation-words.
 */

/**
 * Доска проекта вызова: путь, имя и отметка дома - как у окна (trackerPlaceOf каналов). Проект
 * разговора, которого нет ни среди открытых, ни среди недавних (задание давно закрытого проекта),
 * узнаётся по имени папки.
 */
export const trackerPlaceOf = (
  args: Record<string, unknown>,
  call: NativeCall,
  ports: WorkstationPorts,
): TrackerPlace => placeOfPath(projectOf(args, call, ports.projects), ports)

/** Доска по пути проекта: имя и отметка дома - у открытого или недавнего, иначе имя папки. */
export const placeOfPath = (rootPath: string, ports: WorkstationPorts): TrackerPlace => {
  const state = ports.projects.state()
  const open = state.projects.find((project) => project.rootPath === rootPath)
  const ref = open ?? state.recentProjects.find((project) => project.rootPath === rootPath)

  return { rootPath, name: ref?.name ?? basename(rootPath), home: open?.home === true }
}

/** Правка доски; отказ - словами, where - что из пачки не прошло. */
export const applied = async (
  ports: WorkstationPorts,
  place: TrackerPlace,
  op: TrackerOp,
  where?: string,
) => {
  const outcome = await ports.tracker.apply(place, op)

  if (!outcome.ok) throw trackerError(outcome.code, where)

  return outcome
}

/** Сохранённое - как его покажет доска: модель видит, что легло, и id нового. */
export const savedView = async (
  args: Record<string, unknown>,
  call: NativeCall,
  ports: WorkstationPorts,
  op: TrackerOp,
) => {
  const outcome = await applied(ports, trackerPlaceOf(args, call, ports), op)
  const id = outcome.created ?? ('id' in op ? op.id : '')
  const view = locate(outcome.board, id)?.view ?? { id }

  // Повторяющаяся карточка не стала сделанной - модель должна понять, что это и есть «сделано».
  return outcome.repeated
    ? {
        ...view,
        note: `A repeating card: done for this time, its due moved to ${dueText(outcome.repeated.due)}.`,
      }
    : view
}

/** Только присланное: правка без ключа поле не трогает, а undefined в правке не место. */
export const present = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, one]) => one !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>
  }

/** Правка без переноса: место меняет tracker_move, а не молча пропущенный аргумент. */
export const noMove = (args: Record<string, unknown>, keys: readonly string[]) => {
  const given = keys.filter((key) => args[key] !== undefined)

  if (given.length > 0)
    throw new ArgumentError(`${given.join(', ')}: to move it, use tracker_move.`)
}

/**
 * before_id - сосед в том месте, куда встаёт запись: иначе правка молча поставила бы её в конец.
 * Места нет на открытой доске - решит правка (нет такого, архив, чужая доска).
 */
export const checkBefore = (
  board: TrackerBoard,
  beforeId: string | null,
  slot: Slot,
  movingId?: string,
) => {
  const order = slotOrder(board, slot)?.filter((id) => id !== movingId)

  if (beforeId && order && !order.includes(beforeId)) {
    throw new ArgumentError(
      `"before_id" ${beforeId} is not there. In order: ${order.join(', ') || 'nothing yet'}.`,
    )
  }
}

/** Текст, который можно очистить: нет ключа - не меняется, null или '' - пусто. */
export const textArg = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key]

  if (value === undefined) return undefined
  if (value === null) return ''
  if (typeof value !== 'string') throw new ArgumentError(`"${key}" must be a string`)

  return value
}

const DUE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/

/**
 * Срок одной строкой - так же, как его показывает tracker_board: модель пишет то, что прочла.
 * null или '' - снять срок.
 */
const dueArg = (value: unknown): TrackerDue | null => {
  if (value === null || value === '') return null

  const match = typeof value === 'string' ? DUE.exec(value.trim()) : null

  if (!match?.[1])
    throw new ArgumentError(
      '"due" is YYYY-MM-DD or YYYY-MM-DD HH:MM (local time of this computer), empty to clear',
    )

  return {
    date: match[1],
    time: match[2] && match[3] ? `${match[2].padStart(2, '0')}:${match[3]}` : null,
  }
}

const priorityArg = (value: unknown): TrackerPriority => {
  const found = TRACKER_PRIORITIES.find((priority) => priority === value)

  if (!found) throw new ArgumentError('"priority" is 1 (most urgent), 2, 3 or 4 (none)')

  return found
}

/**
 * Сценарий карточки; null - отвязать. Провайдер - только тот, что работает без человека: иначе
 * карточка встала бы в очередь и отказала бы там.
 */
const bindingArg = (args: Record<string, unknown>): TrackerScenario | null => {
  if (args['scenario'] === null) return null

  const value = recordArg(args, 'scenario') ?? {}
  const scope = value['scope'] === undefined ? 'project' : oneOfArg(value, 'scope', SCENARIO_SCOPES)

  return {
    scenarioId: stringArg(value, 'scenario_id', true),
    scope,
    provider: unattendedProviderArg(value) ?? null,
    inputs: inputsArg(value),
  }
}

/** Поля карточки из аргументов: только присланные, каждое приведено к виду правки. */
export const cardFieldsArg = (args: Record<string, unknown>): Partial<TrackerCardFields> => {
  const fields: Partial<TrackerCardFields> = {}
  const title = textArg(args, 'title')
  const subtitle = textArg(args, 'subtitle')
  const description = textArg(args, 'description')

  if (title !== undefined) fields.title = title
  if (subtitle !== undefined) fields.subtitle = subtitle
  if (description !== undefined) fields.description = description
  if (args['due'] !== undefined) fields.due = dueArg(args['due'])
  if (args['priority'] !== undefined) fields.priority = priorityArg(args['priority'])
  if (args['done'] !== undefined) {
    if (typeof args['done'] !== 'boolean') throw new ArgumentError('"done" must be true or false')

    fields.done = args['done']
  }
  if (args['scenario'] !== undefined) fields.scenario = bindingArg(args)
  if (args['repeat'] !== undefined) fields.repeat = repeatArg(args['repeat'])
  if (args['auto_run'] !== undefined) fields.autoRun = autoRunArg(args['auto_run'])

  return fields
}

/**
 * Привязанные сценарии есть на полке, а их поля - у сценария: ошибку модель видит сразу, а не
 * при отправке в очередь, когда разговор о карточках уже позади.
 */
export const checkBindings = async (
  ports: WorkstationPorts,
  projectPath: string,
  bindings: readonly (TrackerScenario | null | undefined)[],
): Promise<void> => {
  for (const binding of bindings) {
    if (!binding) continue

    const scenario = await ports.scenarios.fetch(projectPath, binding.scenarioId, binding.scope)

    if (!scenario)
      throw scenarioError('scenarioGone', `(${binding.scope} shelf, id ${binding.scenarioId})`)

    const names = scenario.inputs.map((input) => input.name).filter((name) => name.trim())
    const unknown = Object.keys(binding.inputs).filter((name) => !names.includes(name))

    if (unknown.length > 0) {
      throw new ArgumentError(
        `The scenario ${scenario.id} has no input ${unknown.join(', ')}. Its inputs: ${names.join(', ') || 'none'}.`,
      )
    }
  }
}

/** Схема полей карточки: одна у tracker_save_card и tracker_add_cards. */
export const CARD_FIELDS_SCHEMA = {
  title: { type: 'string' },
  subtitle: { type: 'string', description: 'One line under the title.' },
  description: { type: 'string', description: 'Notes, up to 20000 characters.' },
  due: {
    type: 'string',
    description:
      'YYYY-MM-DD or YYYY-MM-DD HH:MM, local time. Empty or null clears it (and its repeat).',
  },
  // Без enum: Gemini (Antigravity) принимает перечисление только у строк.
  priority: { type: 'number', description: '1 (most urgent), 2, 3 or 4 (none, the default).' },
  done: { type: 'boolean' },
  scenario: {
    type: 'object',
    description:
      'Scenario the card runs when sent to a queue (list_scenarios); null unbinds. Input values may hold {{card}} (title, subtitle and description together), {{title}}, {{subtitle}}, {{description}} - filled in at send time. An input not given: the first one gets {{card}}, others stay empty.',
    properties: {
      scenario_id: { type: 'string' },
      scope: { type: 'string', enum: [...SCENARIO_SCOPES], description: 'Default project.' },
      provider: {
        type: 'string',
        description:
          'claude, codex, kimi or opencode. Default: the provider the scenario is written for.',
      },
      inputs: { type: 'object', description: 'Input name -> text.' },
    },
    required: ['scenario_id'],
  },
  ...REPEAT_FIELDS_SCHEMA,
}
