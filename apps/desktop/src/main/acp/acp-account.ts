import type { AccountsState, AccountOutcome } from '@shared/accounts'

import { openExternalWeb } from '../window/open-external'
import type { AcpCli, AcpAgent } from './acp-agent'
import { AcpSignIn } from './acp-sign-in'
import type { AcpCatalog } from './catalog/acp-catalog'
import type { AcpSessionSetup } from './protocol/acp-types'

/** Что панель хранит о входе агента между запусками IDE: кто вошёл. */
export type StoredAcpAccount = { email: string }

/**
 * Вход в агента ACP (ADR 0092): один аккаунт на агента - у `agy` вход общий с терминалом
 * (Keychain), у Kimi - своя папка IDE. Вошёл ли - по ответу агента на сессию (отказ
 * «Authentication required» - нет); тариф - из `_meta` сессии; вход и выход - силами CLI.
 * Для окна - тот же AccountsState, что у Claude и Codex: одна строка аккаунта и шаг входа.
 */
export class AcpAccount {
  private signedIn: boolean | null = null
  private plan = ''
  private upgradeUrl = ''
  private outcome: AccountOutcome | null = null
  /** Страницу входа этого входа IDE уже открыла. */
  private pageOpened = false
  private readonly flow: AcpSignIn

  constructor(
    private readonly agent: AcpAgent,
    private readonly cli: () => Promise<AcpCli | null>,
    private readonly catalog: AcpCatalog,
    private stored: StoredAcpAccount,
    /** Поменялось что-то для окна или для файла панели. */
    private readonly changed: () => void,
    /** Вошли: разговоры, которые стояли без входа, могут идти. */
    private readonly landed: () => void,
  ) {
    this.flow = new AcpSignIn(
      (step) => {
        // Страницу входа открывает IDE, если CLI не открыл её сам (`agy` при NO_BROWSER), - один
        // раз за вход: дальше она есть ссылкой на экране.
        if (step && !step.opened && !this.pageOpened) {
          this.pageOpened = true
          void openExternalWeb(step.url)
        }
        this.changed()
      },
      (end) => {
        this.outcome = end.outcome

        if (end.outcome === 'landed') {
          this.signedIn = true
          if (end.account) this.stored = { email: end.account }
          this.landed()
        }

        this.changed()
      },
    )
  }

  get saved(): StoredAcpAccount {
    return this.stored
  }

  get isSignedOut(): boolean {
    return this.signedIn === false
  }

  state(): AccountsState {
    return {
      current: '',
      accounts: [
        {
          id: '',
          alias: '',
          email: this.stored.email,
          plan: this.plan,
          signedIn: this.signedIn,
          external: false,
        },
      ],
      importable: [],
      signingIn: this.flow.isRunning ? '' : null,
      lastOutcome: this.outcome,
      usage: {},
      step: this.flow.step,
      ...(this.upgradeUrl && { upgradeUrl: this.upgradeUrl }),
    }
  }

  /** Ответ агента на сессию: вошли, тариф и где его поднять. */
  noteSetup(setup: AcpSessionSetup): void {
    const plan = this.agent.planOf?.(setup) ?? null
    const before = JSON.stringify([this.signedIn, this.plan, this.upgradeUrl])

    this.signedIn = true
    if (plan) {
      this.plan = plan.plan
      this.upgradeUrl = plan.upgradeUrl
    }

    if (JSON.stringify([this.signedIn, this.plan, this.upgradeUrl]) !== before) this.changed()
  }

  noteSignedOut(): void {
    if (this.signedIn === false) return

    this.signedIn = false
    this.changed()
  }

  async signIn(): Promise<void> {
    const cli = await this.cli()

    if (!cli) return

    this.outcome = null
    this.pageOpened = false
    this.flow.start(cli, this.agent.login())
    this.changed()
  }

  submitCode(code: string): void {
    this.flow.submitCode(code)
  }

  cancel(): void {
    this.flow.cancel()
  }

  /** Вошёл ли - заново, пробной сессией. */
  async check(): Promise<void> {
    const probe = await this.catalog.probe()

    if (probe.signedOut) this.noteSignedOut()
    else if (probe.setup) this.noteSetup(probe.setup)
  }

  /** Выйти: у `agy` это и выход `agy` в терминале - вход общий. */
  async signOut(): Promise<void> {
    if (!(await this.catalog.logout())) {
      this.outcome = 'logout-failed'
      this.changed()

      return
    }

    this.signedIn = false
    this.plan = ''
    this.upgradeUrl = ''
    this.stored = { email: '' }
    this.changed()
  }

  dispose(): void {
    this.flow.cancel()
  }
}
