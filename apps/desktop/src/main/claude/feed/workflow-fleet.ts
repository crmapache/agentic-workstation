import type {
  FleetAgent,
  FleetPhase,
  WorkflowFleet,
  FleetAgentState,
} from '@shared/conversation-feed'

import { isRecord, numberField, stringField } from '../cli/cli-messages'

type Entry = Record<string, unknown>

/** Число поля или null, если CLI его не прислал (0 - тоже ответ). */
const optionalNumber = (entry: Entry, key: string): number | null => {
  const value = entry[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * «start» у CLI - и «в очереди», и «идёт»; различает их начало работы. Флот из сорока
 * при потолке в шестнадцать больше чем наполовину стоит в очереди, и очередь,
 * нарисованная работой, показывала бы вчетверо больше занятых. «error» со skipped - не
 * падение, а агент, снятый рукой.
 */
const stateOf = (entry: Entry): FleetAgentState => {
  const state = stringField(entry, 'state')

  if (state === 'done') return 'done'
  if (state === 'error') return entry['skipped'] === true ? 'skipped' : 'failed'

  return optionalNumber(entry, 'startedAt') === null ? 'queued' : 'running'
}

const agentOf = (entry: Entry): FleetAgent & { phaseIndex: number | null } => {
  const index = numberField(entry, 'index')
  const attempt = numberField(entry, 'attempt')
  const startedAt = optionalNumber(entry, 'startedAt')

  return {
    index,
    // Агент без подписи и задания всё равно строка: номер - так его зовёт и экран CLI.
    label: stringField(entry, 'label') || stringField(entry, 'promptPreview') || `#${index}`,
    state: stateOf(entry),
    phaseIndex: optionalNumber(entry, 'phaseIndex'),
    agentId: stringField(entry, 'agentId'),
    model: stringField(entry, 'model'),
    durationMs: optionalNumber(entry, 'durationMs'),
    startedAt,
    tokens: numberField(entry, 'tokens'),
    toolCalls: numberField(entry, 'toolCalls'),
    attempt: attempt > 1 ? attempt : 0,
    cached: entry['cached'] === true,
    error: stringField(entry, 'error'),
    prompt: stringField(entry, 'promptPreview'),
    result: stringField(entry, 'resultPreview'),
  }
}

/**
 * Агенты по фазам в порядке появления - в нём скрипт их и гонит. Фаза, до которой
 * никто не дошёл, не рисуется: скрипт решает свои фазы по ходу.
 */
const intoPhases = (
  agents: (FleetAgent & { phaseIndex: number | null })[],
  titles: ReadonlyMap<number, string>,
): FleetPhase[] => {
  const byIndex = new Map<number | null, FleetPhase>()

  for (const { phaseIndex, ...agent } of agents) {
    let phase = byIndex.get(phaseIndex)

    if (!phase) {
      phase = {
        index: phaseIndex,
        title: phaseIndex === null ? '' : (titles.get(phaseIndex) ?? ''),
        agents: [],
      }
      byIndex.set(phaseIndex, phase)
    }

    phase.agents.push(agent)
  }

  return [...byIndex.values()]
}

/**
 * Флот workflow из отчёта CLI (`workflow_progress`). События агентов флота в поток не
 * приходят вовсе - отчёт единственное, что о них известно. CLI шлёт его целиком на
 * каждое изменение, поэтому это чистая функция над последним отчётом, без накопления.
 * null - отчёта нет или в нём пусто.
 */
export const fleetOf = (progress: unknown): WorkflowFleet | null => {
  if (!Array.isArray(progress)) return null

  const titles = new Map<number, string>()
  const log: string[] = []
  const agents: (FleetAgent & { phaseIndex: number | null })[] = []

  for (const entry of progress.filter(isRecord)) {
    const type = stringField(entry, 'type')

    if (type === 'workflow_phase') {
      const title = stringField(entry, 'title')

      if (title) titles.set(numberField(entry, 'index'), title)
    } else if (type === 'workflow_log') {
      const message = stringField(entry, 'message')

      if (message) log.push(message)
    } else if (type === 'workflow_agent') {
      agents.push(agentOf(entry))
    }
  }

  if (agents.length === 0 && log.length === 0 && titles.size === 0) return null

  const count = (state: FleetAgentState) => agents.filter((agent) => agent.state === state).length

  return {
    phases: intoPhases(agents, titles),
    log,
    running: count('running'),
    done: count('done'),
    failed: count('failed'),
    total: agents.length,
  }
}
