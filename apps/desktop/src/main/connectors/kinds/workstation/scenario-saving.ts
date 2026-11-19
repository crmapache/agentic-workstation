import type { Scenario, ScenarioScope } from '@shared/scenarios'

import { ArgumentError } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { freshId, scopeOf } from '../../../scenarios/store/scenario-parse'

/** Полка из аргументов; не названа - проектная. */
export const scopeArg = (args: Record<string, unknown>): ScenarioScope => scopeOf(args['scope'])

/** День недели раза в неделю: 1-7, воскресенье - 7; 0 у cron и getDay - ошибка, а не понедельник. */
export const weekdayArg = (args: Record<string, unknown>): number => {
  const day = args['weekday'] ?? 1

  if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 7) {
    throw new ArgumentError('"weekday" is 1 Monday ... 7 Sunday')
  }

  return day as number
}

/**
 * Полка записи: названная - она (перенос между полками - только так); не названа - та, что в
 * самом объекте (его отдал get_scenario), иначе та, где сценарий с этим id уже лежит. Иначе запись
 * молча увела бы личный сценарий в репозиторий и стёрла бы его с личной полки.
 */
export const shelfToSave = async (
  args: Record<string, unknown>,
  raw: Record<string, unknown> | undefined,
  path: string,
  ports: WorkstationPorts,
): Promise<ScenarioScope> => {
  if (args['scope'] !== undefined) return scopeArg(args)
  if (raw?.['scope'] === 'user' || raw?.['scope'] === 'project') return raw['scope']

  const id = typeof raw?.['id'] === 'string' ? raw['id'] : ''
  const personal = id ? await ports.scenarios.fetch(path, id, 'user') : null

  return personal ? 'user' : 'project'
}

/** Режимы головы и карточек, которые агент пишет сам: спрашивать, только планировать, только читать. */
const AGENT_MODES: readonly string[] = ['', 'default', 'plan', 'readOnly']

const modesOf = (scenario: Scenario): string[] => [
  scenario.head.permissionMode,
  ...scenario.stages.flatMap((stage) => stage.cards.map((card) => card.permissionMode)),
]

/**
 * Режим без вопросов (правки сами, bypass) в сценарии ставит только человек в редакторе: иначе
 * агент написал бы себе исполнителя без вопросов и запустил бы его. Режимы, которые уже стоят в
 * этом сценарии на любой полке, - решение человека, их правка не трогает.
 */
export const checkModes = async (scenario: Scenario, path: string, ports: WorkstationPorts) => {
  const stored = scenario.id
    ? await Promise.all([
        ports.scenarios.fetch(path, scenario.id, 'project'),
        ports.scenarios.fetch(path, scenario.id, 'user'),
      ])
    : []
  const kept = new Set(stored.flatMap((one) => (one ? modesOf(one) : [])))
  const raised = modesOf(scenario).find((mode) => !AGENT_MODES.includes(mode) && !kept.has(mode))

  if (raised) {
    throw new ArgumentError(
      `Only the person sets permission mode ${raised} in a scenario, in its editor. Use default or plan.`,
    )
  }
}

/** У этапов, карточек, вводов и слотов без id - свой id: модель пишет сценарий без них. */
export const withIds = (scenario: Scenario): Scenario => {
  const own = (id: string) => id || freshId()

  return {
    ...scenario,
    inputs: scenario.inputs.map((input) => ({ ...input, id: own(input.id) })),
    stages: scenario.stages.map((stage) => ({
      ...stage,
      id: own(stage.id),
      cards: stage.cards.map((card) => ({
        ...card,
        id: own(card.id),
        slots: card.slots.map((slot) => ({ ...slot, id: own(slot.id) })),
      })),
    })),
  }
}
