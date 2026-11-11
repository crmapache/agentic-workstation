import { setTimeout as delay } from 'node:timers/promises'

import type { Command } from '@agentic-workstation/remote-protocol/commands'

import type { BridgePorts } from './bridge-ports'
import type { Outcome } from './command-ledger'
import { accountsWire, connectorsWire } from './machine-wire'
import { done, fail } from './outcomes'
import type { ProjectKeys } from './project-keys'

export type MachineCommand = Extract<
  Command,
  { name: `accounts.${string}` | `connectors.${string}` | `projects.${string}` }
>

/**
 * Сколько список аккаунтов ждёт свежих лимитов: сервер отвечает за секунды, а телефон не должен
 * ждать минуту, если CLI задумался, - тогда уходят последние известные цифры.
 */
export const USAGE_PATIENCE_MS = 8_000

/**
 * Машина целиком с телефона: открыть недавний проект, аккаунты провайдера и коннекторы IDE.
 * Действия - те же, что у каналов окна (workspace:openRecentProject, accounts:*,
 * connectors:refresh); ответ на перемену - новый список целиком, без второго запроса.
 */
export class MachineCommands {
  constructor(
    private readonly ports: BridgePorts,
    private readonly keys: () => ProjectKeys,
  ) {}

  async run(command: MachineCommand): Promise<Outcome> {
    const { accounts, connectors } = this.ports

    switch (command.name) {
      case 'projects.open':
        return this.openProject(command.args.projectKey)
      case 'accounts.list':
        return this.accounts(true)
      case 'accounts.use': {
        const account = this.account(command.args.accountId)

        if (!account) return fail('notFound')
        // Аккаунт без входа увёл бы все разговоры на экран входа, который с телефона не пройти.
        if (account.signedIn === false) return fail('refused', 'notSignedIn')

        accounts.use(account.id)

        return this.accounts(false)
      }
      case 'accounts.rename':
        if (!this.account(command.args.accountId)) return fail('notFound')

        accounts.rename(command.args.accountId, command.args.alias)

        return this.accounts(false)
      case 'accounts.forget':
        if (!this.account(command.args.accountId)) return fail('notFound')

        await accounts.forget(command.args.accountId)

        return this.accounts(false)
      case 'accounts.logout':
        await accounts.logout()

        return this.accounts(false)
      case 'connectors.list':
        return done(connectorsWire(connectors.list()))
      case 'connectors.reconnect':
        if (!connectors.list().some((one) => one.id === command.args.connectorId)) {
          return fail('notFound')
        }

        await connectors.reconnect(command.args.connectorId)

        return done(connectorsWire(connectors.list()))
    }
  }

  /**
   * Недавний проект - вкладкой в окне IDE: только из тех, что IDE назвала недавними сама.
   * Уже открыт - ничего не делать.
   */
  private async openProject(projectKey: string): Promise<Outcome> {
    const keys = this.keys()
    const path = keys.pathOf(projectKey)

    if (!path) return fail('notFound')
    if (keys.isOpen(path)) return done()

    const { workspace } = this.ports
    const recent = workspace.getState().recentProjects.some((one) => one.rootPath === path)

    if (!recent) return fail('refused', 'notRecent')

    await workspace.openRecent(path)

    return done()
  }

  /** Список аккаунтов; fresh - сначала освежить лимиты вошедших, но не дольше терпения. */
  private async accounts(fresh: boolean): Promise<Outcome> {
    const state = () => this.ports.conversations.getState().accounts

    if (fresh) {
      const signedIn = state()
        .accounts.filter((account) => account.signedIn !== false)
        .map((account) => account.id)

      const patience = new AbortController()

      await Promise.race([
        this.ports.accounts.refreshUsage(signedIn).catch((error: unknown) => {
          console.warn('[remote] лимиты аккаунтов не освежились:', error)
        }),
        delay(USAGE_PATIENCE_MS, undefined, { signal: patience.signal }).catch(() => undefined),
      ])
      patience.abort()
    }

    return done(accountsWire(state()))
  }

  private account(id: string) {
    return this.ports.conversations.getState().accounts.accounts.find((one) => one.id === id)
  }
}
