import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { AccountOutcome } from '@shared/claude-accounts'

import type { ClaudeCli } from '../cli/cli-locator'
import { destroyDrawer } from './account-drawers'
import type { Landing, LandingHost } from './account-landing'
import { landingOf } from './account-landing'
import type { StoredAccount } from './account-store'
import { SIGN_IN_POLL_MS, SIGN_IN_TIMEOUT_MS } from './accounts.constants'
import { writeSignInScript, stopSignInTerminal } from './sign-in'

/** Что ожиданию входа нужно от реестра аккаунтов. */
export type SignInHost = LandingHost & {
  cli: () => Promise<ClaudeCli | null>
  /** Открыть файл программой по умолчанию: .command - в Терминале. Ошибка - текстом. */
  openPath: (path: string) => Promise<string>
  drawerOf: (id: string) => string | null
  /** Перевошли в существующее хранилище (вход истёк): вошёл и тариф. */
  signedInAgain: (id: string, plan: string) => void
  /** Вход в черновик лёг: куда - решено (account-landing.ts). */
  land: (draft: StoredAccount, landing: Exclude<Landing, { kind: 'twin' }>, plan: string) => void
  outcome: (outcome: AccountOutcome | null) => void
}

type SignIn = { id: string; draft: StoredAccount | null; timer: NodeJS.Timeout; until: number }

/**
 * Вход в аккаунт (как AccountSignIn в ACC): Терминал с `claude auth login` в хранилище, и
 * ожидание - вопросом к самому хранилищу, вошёл ли CLI. Выход Терминала - не сигнал: он про
 * оболочку, а не про команду. Новый вход - в черновик; куда он лёг, решает landingOf.
 */
export class SignInFlow {
  private signIn: SignIn | null = null
  /** Вход начинается (папка, скрипт, Терминал): второй в это время не начинается. */
  private starting = false
  /** Опрос хранилища идёт: вопрос «кто вошёл» длиннее шага опроса. */
  private polling = false

  constructor(private readonly host: SignInHost) {}

  /** Вход идёт: id аккаунта (новый - его черновик); null - нет. */
  get signingIn(): string | null {
    return this.signIn ? this.signIn.id : null
  }

  /** Начать вход: makeDraft - черновик нового аккаунта (null - вход в существующий). */
  async begin(id: string, makeDraft: () => Promise<StoredAccount | null>): Promise<void> {
    if (this.starting) return

    this.starting = true

    try {
      const cli = await this.host.cli()

      if (!cli) return

      await this.finish(null)

      const draft = await makeDraft()
      const drawer = draft ? draft.drawer : this.host.drawerOf(id)
      await mkdir(this.host.dir, { recursive: true, mode: 0o700 })

      const script = await writeSignInScript(this.host.dir, cli.binary, drawer, this.pidFile)

      this.signIn = {
        id,
        draft,
        until: Date.now() + SIGN_IN_TIMEOUT_MS,
        timer: setInterval(() => void this.poll(), SIGN_IN_POLL_MS),
      }
      this.host.outcome(null)

      const failure = await this.host.openPath(script)

      if (failure) {
        console.warn('[claude] Терминал для входа не открылся:', failure)
        await this.finish('open-failed')
      }
    } finally {
      this.starting = false
    }
  }

  cancel(): Promise<void> {
    return this.finish('cancelled')
  }

  private async poll() {
    const pending = this.signIn

    if (!pending || this.polling) return
    if (Date.now() > pending.until) return void this.finish('timeout')

    this.polling = true

    try {
      await this.check(pending)
    } finally {
      this.polling = false
    }
  }

  private async check(pending: SignIn) {
    const drawer = pending.draft ? pending.draft.drawer : this.host.drawerOf(pending.id)
    const status = await this.host.statusOf(drawer)

    if (!status?.loggedIn || this.signIn !== pending) return

    if (!pending.draft) {
      this.host.signedInAgain(pending.id, status.plan)

      return void (await this.finish('landed'))
    }

    const cli = await this.host.cli()
    const landing = cli && (await landingOf(cli, this.host, pending.draft))

    // Хранилище ещё не сказало, чей вход, - спросим на следующем шаге, а не решим по догадке.
    if (!landing || this.signIn !== pending) return
    if (landing.kind === 'twin') return void (await this.finish('twin'))

    this.host.land(pending.draft, landing, status.plan)
    // Хранилище черновика теперь у записи: уничтожать его нельзя.
    pending.draft = null
    await this.finish('landed')
  }

  /**
   * Закончить ожидание входа. Не дождались или отменили - Терминал, который ещё ждёт,
   * гасится; незаконченный черновик уничтожается вместе с записью Keychain (twin - вход
   * уже лёг, и токен не должен остаться без хозяина).
   */
  private async finish(outcome: AccountOutcome | null) {
    const pending = this.signIn

    if (!pending) return

    clearInterval(pending.timer)
    this.signIn = null

    if (outcome !== 'landed') await stopSignInTerminal(this.pidFile)
    if (pending.draft) await destroyDrawer(this.host.dir, pending.draft.drawer)

    this.host.outcome(outcome)
  }

  private get pidFile() {
    return join(this.host.dir, 'sign-in.pid')
  }
}
