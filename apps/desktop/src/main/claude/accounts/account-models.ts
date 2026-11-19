import type { PanelPrefs } from '@shared/panel-prefs'

import type { ClaudeCli } from '../cli/cli-locator'
import type { CliMessage } from '../cli/cli-messages'
import { askCli } from '../cli/cli-probe'
import { claudeOf } from '../conversation/claude-conversation'
import { modelsFromReply } from '../conversation/cli-replies'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { AccountCatalogs } from './account-catalogs'
import { environmentFor } from './account-env'
import type { AccountService } from './account-service'
import { clampModel } from './model-catalog'

/** Что модели аккаунтов берут у панели. */
export type AccountModelsHost = {
  accounts: () => AccountService
  cli: () => Promise<ClaudeCli | null>
  prefs: () => PanelPrefs
  /** Чем аккаунт оставили (account-choices.ts): запасная модель, если просимую он не может. */
  choiceOf: (accountId: string) => string | null | undefined
}

/**
 * Модель разговора и аккаунт, на котором он поднимается (как StartingChoice.clamp в ACC):
 * каталоги аккаунтов в памяти и прижатие модели до подъёма процесса. Каталог спрашивается
 * у живого процесса аккаунта (его init) и на экране аккаунтов - в общем конфиге, как спросил
 * бы разговор: свои модели шлюза из настроек человека там видны.
 */
export class AccountModels {
  private readonly catalogs = new AccountCatalogs()

  constructor(private readonly host: AccountModelsHost) {}

  /**
   * Процесс вкладки вот-вот поднимется на аккаунте: модель, которую аккаунт не может, -
   * заменяется до подъёма, и вкладка показывает ту, что правда получилась.
   */
  launching(runtime: ConversationRuntime, accountId: string): void {
    const { customModels, newTabModel } = this.host.prefs()
    const { model } = runtime.meta
    const next = clampModel(model, (name) => this.catalogs.canRun(accountId, name, customModels), [
      this.host.choiceOf(accountId),
      newTabModel,
    ])

    if (next !== model) runtime.update({ model: next })
  }

  /** Живая строка процесса: на первом init аккаунта - спросить его каталог у самого процесса. */
  heard(runtime: ConversationRuntime, message: CliMessage): void {
    const { accountId } = runtime
    const { process } = claudeOf(runtime)
    const isInit = message.type === 'system' && message.subtype === 'init' && !message['task_id']

    if (!isInit || !process) return

    void this.catalogs.learn(accountId, async () =>
      modelsFromReply(await process.control({ subtype: 'list_models' })),
    )
  }

  /**
   * Экран аккаунтов открыт - мимо него аккаунт не сменить: каталог каждого вошедшего, чтобы
   * переезд на него поднял процесс уже на модели, которую тот может. Раз на аккаунт.
   */
  async learnAll(): Promise<void> {
    const cli = await this.host.cli()

    if (!cli) return

    const accounts = this.host.accounts()

    for (const row of accounts.view.accounts) {
      const drawer = accounts.drawerFor(row.id)

      if (row.signedIn !== true || drawer === undefined) continue

      const env = environmentFor(cli.env, drawer)

      await this.catalogs.learn(row.id, async () =>
        modelsFromReply(await askCli({ ...cli, env }, { subtype: 'list_models' })),
      )
    }
  }

  /** Вход аккаунта заменён или аккаунт забыт: его прежний каталог больше не ответ. */
  forget(accountId: string): void {
    this.catalogs.forget(accountId)
  }
}
