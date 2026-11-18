import type { ClaudeState } from '@shared/claude'
import type { ProviderInfo } from '@shared/providers'
import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { TaskRunSummary } from '@shared/tasks'
import { isTaskRunWorking } from '@shared/tasks'
import type { WorkspaceState } from '@shared/workspace'

import type { InventoryMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { CAP_PUSH, CAP_PARTS } from '@agentic-workstation/remote-protocol/agent-messages'
import { EFFORTS, PERMISSION_MODES } from '@agentic-workstation/remote-protocol/commands'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'
import type { ProviderCaps, TasksSummary } from '@agentic-workstation/remote-protocol/wire-types'

import { summaryOf, CLAUDE_PROVIDER } from './conversation-wire'
import type { StatusClock } from './conversation-wire'
import type { ProjectKeys } from './project-keys'
import { queuesSummary } from './scenario-wire'

export type InventoryInput = {
  workspace: WorkspaceState
  claude: ClaudeState
  queues: ScenarioQueuesView
  taskRuns: readonly Pick<TaskRunSummary, 'projectPath' | 'state'>[]
  providers: ProviderInfo[]
  keys: ProjectKeys
  clock: StatusClock
  /** Режимы, в которых новый разговор проекта не начнётся (ModeGate.offForNew). */
  newModesOff: (projectPath: string) => readonly string[]
  machine: { label: string; ideVersion: string }
  epoch: string
  now: number
}

/** Что можно выбрать у провайдера с телефона: модели каталога, усилия, режимы окна (ADR 0076). */
const capsOf = (provider: ProviderInfo, claude: ClaudeState): ProviderCaps => ({
  id: provider.id,
  label: provider.label,
  available: provider.available,
  models:
    provider.id === CLAUDE_PROVIDER
      ? claude.models.map((model) => ({
          value: model.value,
          label: model.displayName,
          description: model.description,
          ...(model.fast !== undefined && { fast: model.fast }),
        }))
      : [],
  efforts: [...EFFORTS],
  permissionModes: [...PERMISSION_MODES],
})

/** Задания проекта коротко: сколько прогонов работает само - знак работы на телефоне. */
const tasksSummary = (runs: InventoryInput['taskRuns'], rootPath: string): TasksSummary => ({
  working: runs.filter((run) => run.projectPath === rootPath && isTaskRunWorking(run.state)).length,
})

/**
 * Что есть на машине - открытые проекты с разговорами, очередями и заданиями и недавние закрытые
 * (у них - только очереди и задания: те живут на уровне IDE, ADR 0039 и 0069). Путей нет: проект
 * - ключом.
 */
export const inventoryOf = (input: InventoryInput): InventoryMessage => {
  const { workspace, claude, queues, taskRuns, keys, clock, now } = input
  const open = workspace.projects.map((project) => ({
    key: keys.keyOf(project.rootPath),
    name: project.name,
    open: true,
    conversations: claude.conversations
      .filter((conversation) => conversation.projectPath === project.rootPath)
      .map((conversation) => summaryOf(conversation, clock.since(conversation, now))),
    queues: queuesSummary(queues, project.rootPath),
    tasks: tasksSummary(taskRuns, project.rootPath),
    unavailableModes: { [CLAUDE_PROVIDER]: [...input.newModesOff(project.rootPath)] },
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
    providers: input.providers.map((provider) => capsOf(provider, claude)),
    projects: [...open, ...recent],
  }
}

/**
 * Отпечаток инвентаря без часов: список шлётся заново, только когда в нём что-то поменялось,
 * а не на каждую букву ответа модели.
 */
export const inventoryPrint = (inventory: InventoryMessage): string =>
  JSON.stringify({ ...inventory, at: 0 })
