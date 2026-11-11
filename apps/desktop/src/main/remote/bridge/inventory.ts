import type { ClaudeState } from '@shared/claude'
import type { ProviderInfo } from '@shared/providers'
import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { WorkspaceState } from '@shared/workspace'

import type { InventoryMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { CAP_PARTS } from '@agentic-workstation/remote-protocol/agent-messages'
import { EFFORTS, PHONE_PERMISSION_MODES } from '@agentic-workstation/remote-protocol/commands'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'
import type { ProviderCaps } from '@agentic-workstation/remote-protocol/wire-types'

import { summaryOf, CLAUDE_PROVIDER } from './conversation-wire'
import type { StatusClock } from './conversation-wire'
import type { ProjectKeys } from './project-keys'
import { queuesSummary } from './scenario-wire'

export type InventoryInput = {
  workspace: WorkspaceState
  claude: ClaudeState
  queues: ScenarioQueuesView
  providers: ProviderInfo[]
  keys: ProjectKeys
  clock: StatusClock
  machine: { label: string; ideVersion: string }
  epoch: string
  now: number
}

/** Что можно выбрать у провайдера с телефона: модели из каталога, усилия, режимы без bypass и auto. */
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
        }))
      : [],
  efforts: [...EFFORTS],
  permissionModes: [...PHONE_PERMISSION_MODES],
})

/**
 * Что есть на машине - открытые проекты с разговорами и очередями и недавние закрытые (у них -
 * только очереди: сценарии живут на уровне IDE, ADR 0039). Путей нет: проект - ключом.
 */
export const inventoryOf = (input: InventoryInput): InventoryMessage => {
  const { workspace, claude, queues, keys, clock, now } = input
  const open = workspace.projects.map((project) => ({
    key: keys.keyOf(project.rootPath),
    name: project.name,
    open: true,
    conversations: claude.conversations
      .filter((conversation) => conversation.projectPath === project.rootPath)
      .map((conversation) => summaryOf(conversation, clock.since(conversation, now))),
    queues: queuesSummary(queues, project.rootPath),
  }))
  const recent = workspace.recentProjects
    .filter((project) => !keys.isOpen(project.rootPath))
    .map((project) => ({
      key: keys.keyOf(project.rootPath),
      name: project.name,
      open: false,
      conversations: [],
      queues: queuesSummary(queues, project.rootPath),
    }))

  return {
    p: PROTOCOL_VERSION,
    k: 'inventory',
    at: now,
    epoch: input.epoch,
    machine: input.machine,
    caps: [CAP_PARTS],
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
