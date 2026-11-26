import { isProviderId, worksUnattended } from '@shared/providers'
import type { ProviderId } from '@shared/providers'
import type { QueueHours, QueueTarget } from '@shared/scenario-queues'
import type { ProjectRef } from '@shared/workspace'

import { stringArg, booleanArg, ArgumentError } from '../native-tools'
import type { NativeCall } from '../native-tools'
import type { ProjectsPort } from '../../../workstation/workstation-link'

/** Схема аргумента проекта: у всех инструментов одна, чтобы модель не гадала. */
export const PROJECT_ARG = {
  type: 'string',
  description:
    'Project folder path or name, as list_projects shows it. Default: the project of this conversation.',
}

/**
 * «Запустить рядом сразу» (ADR 0128): новая очередь без worktree не ждёт папку проекта. Это выбор
 * человека - модель ставит его, только когда человек так и попросил.
 */
export const ALONGSIDE_ARG = {
  type: 'boolean',
  description:
    'New queue without a worktree only: start at once beside the queues that hold the project folder instead of waiting its turn. Both would change the same files - only when the user asked for it. Default false.',
}

/** Новая очередь по словам модели: свой worktree или папка проекта, ждать ли её. */
export const newQueueTarget = (args: Record<string, unknown>): QueueTarget => {
  const worktree = booleanArg(args, 'worktree', false)

  return {
    kind: 'new',
    worktree,
    ...(!worktree && booleanArg(args, 'alongside', false) && { alongside: true }),
  }
}

/** Схема рабочих часов очереди: окно по дням недели в местном времени машины. */
export const HOURS_ARG = {
  type: 'object',
  description:
    'Working hours: outside them the queue sleeps (the running scenario pauses, the next one does not start) and wakes by itself when they begin. Local time of this computer. to earlier than from runs past midnight; from equal to to is the whole day.',
  properties: {
    from: { type: 'string', description: 'HH:MM' },
    to: { type: 'string', description: 'HH:MM' },
    days: {
      type: 'array',
      items: { type: 'number' },
      description: 'Weekdays the window opens on: 1 Monday ... 7 Sunday.',
    },
  },
  required: ['from', 'to', 'days'],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Объект из аргументов; required - без него вызов не имеет смысла. */
export const recordArg = (
  args: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined => {
  const value = args[key]

  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) throw new ArgumentError(`"${key}" must be an object`)

  return value
}

/** Одно из перечисленных значений. */
export const oneOfArg = <T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T => {
  const value = args[key]
  const found = allowed.find((one) => one === value)

  if (!found) throw new ArgumentError(`"${key}" is one of: ${allowed.join(', ')}`)

  return found
}

/** Ответы на вводы сценария: только строки. */
export const inputsArg = (
  args: Record<string, unknown>,
  key = 'inputs',
): Record<string, string> => {
  const value = recordArg(args, key) ?? {}

  return Object.fromEntries(
    Object.entries(value).map(([name, answer]) => {
      if (typeof answer !== 'string') throw new ArgumentError(`input "${name}" must be a string`)

      return [name, answer]
    }),
  )
}

export const providerArg = (args: Record<string, unknown>): ProviderId | undefined => {
  const value = args['provider']

  if (value === undefined || value === null || value === '') return undefined
  if (!isProviderId(value))
    throw new ArgumentError('"provider" is claude, codex, antigravity, kimi or opencode')

  return value
}

/** Провайдер работы без человека (сценарий, очередь, задание): Antigravity - нет (ADR 0094). */
export const unattendedProviderArg = (args: Record<string, unknown>): ProviderId | undefined => {
  const value = providerArg(args)

  if (value && !worksUnattended(value)) throw new ArgumentError(CHAT_ONLY)

  return value
}

/** Отказ словами: Antigravity работает только в чате человека (условия Google). */
export const CHAT_ONLY =
  'antigravity works only in its own chat, typed by the person: Google does not allow it to run unattended or take messages from other agents'

const CLOCK = /^(\d{1,2}):(\d{2})$/

/** «09:30» - минуты от полуночи. */
export const minutesOf = (value: unknown, key: string): number => {
  const match = typeof value === 'string' ? CLOCK.exec(value.trim()) : null
  const hours = Number(match?.[1])
  const minutes = Number(match?.[2])

  if (!match || hours > 23 || minutes > 59) throw new ArgumentError(`"${key}" is a time HH:MM`)

  return hours * 60 + minutes
}

/** Минуты от полуночи - «09:30». */
export const clockOf = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** Рабочие часы из аргумента; null - не заданы. */
export const hoursArg = (args: Record<string, unknown>, key: string): QueueHours | null => {
  const value = recordArg(args, key)

  if (!value) return null

  const days = value['days']

  // Пусто - окно не откроется никогда, и очередь спала бы вечно; 0 - не воскресенье, а ошибка.
  if (
    !Array.isArray(days) ||
    days.length === 0 ||
    !days.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  ) {
    throw new ArgumentError(`"${key}.days" lists weekdays, at least one: 1 Monday ... 7 Sunday`)
  }

  return {
    from: minutesOf(value['from'], `${key}.from`),
    to: minutesOf(value['to'], `${key}.to`),
    days: days as number[],
  }
}

export const hoursView = (hours: QueueHours | null) =>
  hours && { from: clockOf(hours.from), to: clockOf(hours.to), days: hours.days }

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * Момент - местным временем машины со сдвигом пояса: «2026-11-19T09:00:00-06:00». Модель
 * пересказывает его человеку, и Z на конце она переводила бы в его часы с ошибкой. 0 - пусто.
 */
export const timeOf = (ms: number): string => {
  if (!ms) return ''

  const at = new Date(ms)
  const offset = -at.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const shift = Math.abs(offset)
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`

  return `${date}T${clock}${sign}${pad(Math.floor(shift / 60))}:${pad(shift % 60)}`
}

/** Проекты, которые IDE знает: открытые вкладками и недавние. */
export const knownProjects = (projects: ProjectsPort): ProjectRef[] => {
  const state = projects.state()

  return [...state.projects, ...state.recentProjects]
}

/** Найти проект по пути или имени среди известных; не нашёлся - отказ словами для модели. */
export const findProject = (refs: readonly ProjectRef[], named: string): string => {
  const byPath = refs.find((project) => project.rootPath === named)

  if (byPath) return byPath.rootPath

  const byName = refs.filter((project) => project.name === named)

  if (byName.length > 1) {
    throw new ArgumentError(`Several projects are called ${named}: give the folder path.`)
  }

  if (byName[0]) return byName[0].rootPath

  throw new ArgumentError(
    `No project ${named} in the IDE. Known: ${refs.map((project) => project.name).join(', ') || 'none'}.`,
  )
}

/**
 * Проект вызова: названный моделью (путь или имя) или проект разговора. Снаружи разговора нет -
 * проект надо назвать.
 */
export const projectOf = (
  args: Record<string, unknown>,
  call: NativeCall,
  projects: ProjectsPort,
): string => {
  const named = stringArg(args, 'project')

  if (named) return findProject(knownProjects(projects), named)

  const own = call.launch?.projectPath

  if (own) return own

  throw new ArgumentError('Name the project ("project"): this call comes from outside the IDE.')
}

/** Вызов снаружи IDE: у процесса нет проекта (вход снаружи, ADR 0090). */
export const isOutside = (call: NativeCall): boolean => !call.launch?.projectPath

/**
 * Списки - по всем проектам: попросили, или вызов снаружи и проект не назван; иначе - проект
 * вызова. null - все проекты.
 */
export const listScopeOf = (
  args: Record<string, unknown>,
  call: NativeCall,
  projects: ProjectsPort,
): string | null => {
  const named = typeof args['project'] === 'string' && args['project'].trim() !== ''
  const every = args['all_projects'] === true || (isOutside(call) && !named)

  return every ? null : projectOf(args, call, projects)
}

/** Открытый вкладкой проект: разговоры живут только в открытых. */
export const openProjectOf = (
  args: Record<string, unknown>,
  call: NativeCall,
  projects: ProjectsPort,
): string => {
  const path = projectOf(args, call, projects)

  if (!projects.state().projects.some((project) => project.rootPath === path)) {
    throw new ArgumentError(`The project ${path} is not open. Open it first with open_project.`)
  }

  return path
}

/** Разговор, который зовёт инструмент; снаружи IDE - null. */
export const callerOf = (call: NativeCall): string | null => call.launch?.conversationId ?? null
