import type { TFunction } from 'i18next'

import type { FeedView } from '@agentic-workstation/remote-protocol/feed'
import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'

import type { Fields } from '../Feed/Feed.utils'
import {
  text,
  count,
  fields,
  actionOf,
  parentOf,
  stepCounts,
  runningTask,
} from '../Feed/Feed.utils'
import { clockText, durationText } from '../../../lib/time.utils'
import type { Capsule, CapsuleKind } from './TaskCapsules.types'

/** Задача за вызовом, которая ещё идёт: у CLI её итога нет (outcome null). */
const liveTask = (item: Fields): Fields | null => {
  const task = fields(item, 'task')

  return task && 'outcome' in task && task['outcome'] === null ? task : null
}

/**
 * Вызов субагента или флота: по виду действия или по задаче CLI (агент, поднятый скиллом,
 * вызова Task не имеет), у IDE постарше - по имени инструмента Claude Code.
 */
const isAgentCall = (item: FeedItemWire): boolean => {
  const action = actionOf(item)
  const kind = text(fields(item, 'task') ?? {}, 'kind')

  if (kind === 'agent' || kind === 'workflow' || action?.['kind'] === 'agent') return true

  return !action && ['Task', 'Agent'].includes(text(item, 'name'))
}

/** Флот workflow: по виду вызова (отчёта флота могло ещё не быть) или по задаче CLI. */
const isWorkflow = (item: FeedItemWire): boolean =>
  actionOf(item)?.['workflow'] === true || text(fields(item, 'task') ?? {}, 'kind') === 'workflow'

const fleetOf = (task: Fields | null): Capsule['fleet'] => {
  const fleet = task ? fields(task, 'fleet') : null
  const total = fleet ? count(fleet, 'total') : 0

  return fleet && total > 0 ? { done: count(fleet, 'done'), total } : null
}

/** Капсула по строке вызова; null - строка не задача, которая сейчас идёт. */
const capsuleOf = (item: FeedItemWire, steps: Map<string, number>): Capsule | null => {
  if (item.kind !== 'tool' || parentOf(item) !== null) return null

  const task = fields(item, 'task')
  const live = liveTask(item)
  const action = actionOf(item) ?? {}
  const input = fields(item, 'input') ?? {}
  const taskKind = text(task ?? {}, 'kind')
  const agent = isAgentCall(item) && text(item, 'status') === 'running'
  const kind: CapsuleKind | null = agent
    ? isWorkflow(item)
      ? 'workflow'
      : 'agent'
    : live && (taskKind === 'command' || taskKind === 'monitor' || taskKind === 'wakeup')
      ? taskKind
      : null

  if (!kind) return null

  const isAgent = kind === 'agent' || kind === 'workflow'

  return {
    id: item.id,
    kind,
    agent: isAgent ? text(action, 'agent') || text(input, 'subagent_type') : '',
    activity: text(task ?? {}, 'activity'),
    description: text(action, 'description') || text(input, 'description'),
    detail: isAgent
      ? text(action, 'prompt')
      : text(action, 'command') || text(action, 'url') || text(input, 'command'),
    // Агент - со своего вызова, как у чипа окна; фоновая команда - с начала задачи.
    startedAt: isAgent ? count(item, 'startedAt') : count(task ?? {}, 'startedAt'),
    dueAt: kind === 'wakeup' ? count(task ?? {}, 'dueAt') : 0,
    fleet: kind === 'workflow' ? fleetOf(task) : null,
    steps: steps.get(item.id) ?? 0,
    stop: kind === 'wakeup' ? null : runningTask(item),
  }
}

/**
 * Капсулы над лентой - как чипы панели IDE (StreamSwitcher): живые агенты верхнего уровня по
 * порядку запуска, потом фоновые команды и наблюдатели, потом будильники агента. Кончилась задача - капсулы нет.
 * Строки вызова выше загруженной ленты на телефоне нет - нет и её капсулы.
 */
export const taskCapsules = (view: Pick<FeedView, 'items' | 'steps'> | undefined): Capsule[] => {
  if (!view) return []

  const steps = stepCounts(view)
  const capsules = view.items.flatMap((item) => capsuleOf(item, steps) ?? [])
  const rank: Record<CapsuleKind, number> = {
    agent: 0,
    workflow: 0,
    command: 1,
    monitor: 1,
    wakeup: 2,
  }

  return capsules.sort((first, second) => rank[first.kind] - rank[second.kind])
}

/**
 * Команда двумя словами для капсулы, как у чипа окна: `pnpm dev`, `sandbox.sh`. Описание модели -
 * целое предложение, оно вытолкнуло бы остальные капсулы.
 */
export const commandLabel = (command: string): string => {
  const words = (command.split('\n')[0] ?? '').trim().split(/\s+/).filter(Boolean)
  const [first = '', second = ''] = words
  const name = first.split('/').pop() ?? first

  return second && !second.startsWith('-') ? `${name} ${second}` : name
}

/** Что написано на капсуле после имени: чем занят агент, команда коротко, время будильника. */
export const capsuleMeta = (capsule: Capsule): string => {
  switch (capsule.kind) {
    case 'agent':
    case 'workflow':
      return capsule.activity || capsule.description
    case 'command':
      return commandLabel(capsule.detail) || capsule.description
    // Команда наблюдателя обычно `tail -F … | grep`: двумя словами это просто «tail».
    case 'monitor':
      return capsule.description || commandLabel(capsule.detail)
    case 'wakeup':
      return ''
  }
}

/** Доля законченных агентов флота, проценты; не флот - null. */
export const fleetPercent = (capsule: Capsule): number | null =>
  capsule.fleet ? Math.round((capsule.fleet.done / capsule.fleet.total) * 100) : null

/**
 * Сколько осталось до будильника - грубо и вверх, как у чипа окна: «45s», «14m», «1h 5m».
 * Секунды - только в последнюю минуту; прошедший срок - ноль (CLI вот-вот начнёт ход).
 */
export const countdownText = (t: TFunction, ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000))

  if (seconds < 60) return t('time.seconds', { count: seconds })

  const minutes = Math.ceil(seconds / 60)

  return minutes < 60
    ? t('time.minutes', { count: minutes })
    : t('time.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
}

/** Имя на капсуле - как у чипа окна: тип агента, «workflow:4», «bg», «wake». */
export const capsuleName = (t: TFunction, capsule: Capsule): string => {
  switch (capsule.kind) {
    case 'agent':
      return capsule.agent || t('capsules.agent')
    case 'workflow':
      return capsule.fleet
        ? t('capsules.workflowCount', { count: capsule.fleet.total })
        : t('capsules.workflow')
    case 'command':
      return t('capsules.background')
    case 'monitor':
      return t('capsules.monitor')
    case 'wakeup':
      return t('capsules.wakeup')
  }
}

/**
 * Время задачи; now - по часам IDE. У агента и команды - сколько идёт, у будильника - сколько
 * ждать. Начало неизвестно - пусто, а не «0s».
 */
export const capsuleTime = (t: TFunction, capsule: Capsule, now: number): string => {
  if (capsule.kind === 'wakeup') {
    return capsule.dueAt
      ? t('capsules.wakeIn', { time: countdownText(t, capsule.dueAt - now) })
      : ''
  }

  return capsule.startedAt ? durationText(t, now - capsule.startedAt) : ''
}

/** Строка под заголовком листа: «Running · 3m 05s», у будильника - «in 14m». */
export const sheetSubtitle = (t: TFunction, capsule: Capsule, now: number): string => {
  const time = capsuleTime(t, capsule, now)

  return time && capsule.kind !== 'wakeup' ? t('capsules.running', { time }) : time
}

/** Заголовок листа задачи; offset - насколько часы IDE впереди: срок будильника - по часам телефона. */
export const capsuleTitle = (t: TFunction, capsule: Capsule, offset: number): string => {
  switch (capsule.kind) {
    case 'agent':
      return capsule.agent
        ? t('capsules.titles.agentNamed', { name: capsule.agent })
        : t('capsules.titles.agent')
    case 'workflow':
      return capsule.fleet
        ? t('capsules.titles.workflowFleet', capsule.fleet)
        : t('capsules.titles.workflow')
    case 'command':
      return t('capsules.titles.command')
    case 'monitor':
      return t('capsules.titles.monitor')
    case 'wakeup':
      return capsule.dueAt
        ? t('capsules.titles.wakeupAt', { clock: clockText(capsule.dueAt - offset) })
        : t('capsules.titles.wakeup')
  }
}

/** Строка листа задачи: подпись капсом и текст; code - команда как есть, моноширинно. */
export type SheetLine = { key: string; label: string; value: string; code?: boolean }

/**
 * Что показать в листе задачи: у агента - чем занят, поручение, задание целиком (если оно не то
 * же поручение) и шаги; у команды - что делает и сама команда; у будильника - с чем разбудит.
 * Пустого нет: IDE постарше многого не шлёт.
 */
export const sheetLines = (t: TFunction, capsule: Capsule): SheetLine[] => {
  const line = (key: string, value: string, code = false): SheetLine[] =>
    value ? [{ key, label: t(`capsules.lines.${key}`), value, ...(code && { code }) }] : []

  switch (capsule.kind) {
    case 'agent':
    case 'workflow':
      return [
        ...line('activity', capsule.activity),
        ...line('description', capsule.description),
        ...line('prompt', capsule.detail === capsule.description ? '' : capsule.detail),
        ...line('steps', capsule.steps > 0 ? t('feed.steps', { count: capsule.steps }) : ''),
      ]
    case 'command':
    case 'monitor':
      return [...line('purpose', capsule.description), ...line('command', capsule.detail, true)]
    case 'wakeup':
      return line('wakeWith', capsule.activity)
  }
}
