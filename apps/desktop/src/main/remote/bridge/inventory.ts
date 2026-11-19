import type { AgentPanelState } from '@shared/conversation'
import type { ProviderId, ProviderInfo } from '@shared/providers'
import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { TaskRunSummary } from '@shared/tasks'
import { isTaskRunWorking } from '@shared/tasks'
import type { WorkspaceState } from '@shared/workspace'

import type { InventoryMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { CAP_PUSH, CAP_PARTS } from '@agentic-workstation/remote-protocol/agent-messages'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'
import type {
  ProviderCaps,
  TasksSummary,
  ProviderModel,
} from '@agentic-workstation/remote-protocol/wire-types'

import { summaryOf } from './conversation-wire'
import type { StatusClock } from './conversation-wire'
import type { ProjectKeys } from './project-keys'
import { queuesSummary } from './scenario-wire'

/**
 * Панель провайдера, как её видит список машины: состояние (разговоры, каталог, возможности) и
 * провайдер для всего, что не панель (providers:list); info null - CLI ещё ищут.
 */
export type PanelView = { provider: ProviderId; state: AgentPanelState; info: ProviderInfo | null }

export type InventoryInput = {
  workspace: WorkspaceState
  /** Панели провайдеров по порядку: первой - Claude Code. */
  panels: readonly PanelView[]
  queues: ScenarioQueuesView
  taskRuns: readonly Pick<TaskRunSummary, 'projectPath' | 'state'>[]
  keys: ProjectKeys
  clock: StatusClock
  /** Режимы, в которых новый разговор проекта у провайдера не начнётся (ModeGate.offForNew). */
  newModesOff: (provider: ProviderId, projectPath: string) => readonly string[]
  machine: { label: string; ideVersion: string }
  epoch: string
  now: number
}

/**
 * Модель провайдера телефону: подпись, пояснение (у открытой модели без своего - имя её
 * подключения: одна модель бывает у двух), есть ли быстрый режим (его знает каталог панели) и
 * свои уровни усилия.
 */
const modelWire = (
  model: NonNullable<ProviderInfo['models']>[number],
  fast: boolean | undefined,
): ProviderModel => ({
  value: model.value,
  label: model.displayName,
  description: model.description || (model.group?.label ?? ''),
  ...(fast !== undefined && { fast }),
  ...(model.efforts && { efforts: [...model.efforts] }),
})

/**
 * Что можно выбрать у провайдера с телефона (ADR 0076, 0083): его модели (как в меню окна, со
 * своими у Claude Code), уровни усилия и режимы, и что он умеет сверх разговора - чего не умеет,
 * телефон не показывает.
 */
const capsOf = (info: ProviderInfo, state: AgentPanelState): ProviderCaps => {
  const fast = new Map(state.models.map((model) => [model.value, model.fast]))
  const { capabilities } = state

  return {
    id: info.id,
    label: info.label,
    available: info.available,
    models: (info.models ?? []).map((model) => modelWire(model, fast.get(model.value))),
    efforts: [...info.efforts],
    permissionModes: [...info.modes],
    aside: capabilities.sideQuestion,
    fastMode: capabilities.fastMode,
    stopTask: capabilities.stopTask,
    rewind: capabilities.rewind,
    rewindScopes: [...capabilities.rewindScopes],
    // Только свой чат (ADR 0094): телефон гасит его в выборе прогона и часа, а не узнаёт отказом.
    chatOnly: info.chatOnly === true,
  }
}

/** Задания проекта коротко: сколько прогонов работает само - знак работы на телефоне. */
const tasksSummary = (runs: InventoryInput['taskRuns'], rootPath: string): TasksSummary => ({
  working: runs.filter((run) => run.projectPath === rootPath && isTaskRunWorking(run.state)).length,
})

/**
 * Что есть на машине - открытые проекты с разговорами всех панелей, очередями и заданиями и
 * недавние закрытые (у них - только очереди и задания: те живут на уровне IDE, ADR 0039 и 0069).
 * Путей нет: проект - ключом.
 */
export const inventoryOf = (input: InventoryInput): InventoryMessage => {
  const { workspace, panels, queues, taskRuns, keys, clock, now } = input
  const open = workspace.projects.map((project) => ({
    key: keys.keyOf(project.rootPath),
    name: project.name,
    open: true,
    conversations: panels.flatMap(({ provider, state }) =>
      state.conversations
        .filter((conversation) => conversation.projectPath === project.rootPath)
        .map((conversation) => summaryOf(conversation, provider, clock.since(conversation, now))),
    ),
    queues: queuesSummary(queues, project.rootPath),
    tasks: tasksSummary(taskRuns, project.rootPath),
    unavailableModes: Object.fromEntries(
      panels.map(({ provider }) => [provider, [...input.newModesOff(provider, project.rootPath)]]),
    ),
  }))
  const recent = workspace.recentProjects
    .filter((project) => !keys.isOpen(project.rootPath))
    .map((project) => ({
      key: keys.keyOf(project.rootPath),
      name: project.name,
      open: false,
      conversations: [],
      queues: queuesSummary(queues, project.rootPath),
      tasks: tasksSummary(taskRuns, project.rootPath),
    }))

  return {
    p: PROTOCOL_VERSION,
    k: 'inventory',
    at: now,
    epoch: input.epoch,
    machine: input.machine,
    caps: [CAP_PARTS, CAP_PUSH],
    providers: panels.flatMap(({ info, state }) => (info ? [capsOf(info, state)] : [])),
    projects: [...open, ...recent],
  }
}

/**
 * Отпечаток инвентаря без часов: список шлётся заново, только когда в нём что-то поменялось,
 * а не на каждую букву ответа модели.
 */
export const inventoryPrint = (inventory: InventoryMessage): string =>
  JSON.stringify({ ...inventory, at: 0 })
