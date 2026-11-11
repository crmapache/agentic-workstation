import type { Command } from '@agentic-workstation/remote-protocol/commands'

import type { BridgePorts } from './bridge-ports'
import type { Outcome } from './command-ledger'
import type { ConversationCommand } from './conversation-commands'
import { ConversationCommands } from './conversation-commands'
import type { Redact } from './fit'
import { MachineCommands } from './machine-commands'
import type { ProjectKeys } from './project-keys'
import type { ScenarioCommand } from './scenario-commands'
import { ScenarioCommands } from './scenario-commands'

const isConversation = (command: Command): command is ConversationCommand =>
  command.name.startsWith('conversation.')

const isScenario = (command: Command): command is ScenarioCommand =>
  command.name.startsWith('scenarios.')

/**
 * Команды телефона - публичными методами сервисов IDE, теми же, что зовёт окно: разговоры
 * (ClaudeService и панель), сценарии (ScenarioService) и машина (проекты, аккаунты, коннекторы).
 * Проект - по ключу из тех, что IDE назвала сама; разговор - только в открытом проекте; прогон
 * и очередь - по id, их проект находит IDE.
 */
export class CommandDesk {
  private readonly conversations: ConversationCommands
  private readonly scenarios: ScenarioCommands
  private readonly machine: MachineCommands

  constructor(ports: BridgePorts, keys: () => ProjectKeys, redact: () => Redact) {
    this.conversations = new ConversationCommands(ports, keys, redact)
    this.scenarios = new ScenarioCommands(ports, keys, redact)
    this.machine = new MachineCommands(ports, keys)
  }

  run(command: Command): Promise<Outcome> {
    if (isConversation(command)) return this.conversations.run(command)
    if (isScenario(command)) return this.scenarios.run(command)

    return this.machine.run(command)
  }
}
