import type { AccountOutcome } from '@shared/accounts'

import type { CodexLogin, CodexCatalog } from '../catalog/codex-catalog'

/** Что входу нужно от панели. */
export type SignInHost = {
  catalog: CodexCatalog
  /** Открыть ссылку в браузере человека; false - не сайт, не открыта. */
  openUrl: (url: string) => boolean
  /** Состояние входа поменялось - окну. */
  changed: () => void
  /** Вошли: аккаунт, модели и лимиты заново, разговоры - на новом входе. */
  signedIn: () => Promise<void>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Вход в Codex через ChatGPT - силами самого Codex, без терминала (как в amazing-codex):
 * `account/login/start` даёт ссылку, IDE открывает её в браузере, возврат из браузера Codex
 * ловит сам и присылает `account/login/completed`. Повторное «Sign in» посреди входа
 * открывает ту же ссылку снова, а не начинает второй вход.
 */
export class CodexSignIn {
  private pending: CodexLogin | null = null
  /** Codex ещё выдаёт ссылку; cancelled - человек отменил, пока её не было. */
  private starting = false
  private cancelled = false
  /** Чем кончилось последнее действие со входом - строкой на экране входа. */
  outcome: AccountOutcome | null = null

  constructor(private readonly host: SignInHost) {}

  get isWaiting(): boolean {
    return this.pending !== null || this.starting
  }

  async start(): Promise<void> {
    if (this.pending) return this.open(this.pending.authUrl)
    if (this.starting) return

    this.outcome = null
    this.starting = true
    this.cancelled = false

    const started = await this.host.catalog.startSignIn()

    this.starting = false

    // Отменили, пока Codex выдавал ссылку: вход у Codex снимается, браузер не открывается.
    if (this.cancelled) {
      if (started) await this.host.catalog.cancelSignIn(started.loginId)

      return
    }

    if (!started) {
      this.outcome = 'open-failed'
      this.host.changed()

      return
    }

    this.pending = started
    this.host.changed()
    this.open(started.authUrl)
  }

  async cancel(): Promise<void> {
    const pending = this.pending

    if (!pending) {
      if (this.starting) {
        this.cancelled = true
        this.outcome = 'cancelled'
        this.host.changed()
      }

      return
    }

    this.pending = null
    this.outcome = 'cancelled'
    this.host.changed()
    await this.host.catalog.cancelSignIn(pending.loginId)
  }

  /** Уведомление `account/login/completed`: чужой вход (другой loginId) не наш. */
  completed(params: unknown): void {
    const body = isRecord(params) ? params : {}

    if (!this.pending || (body['loginId'] && body['loginId'] !== this.pending.loginId)) return

    this.pending = null
    this.outcome = body['success'] === true ? 'landed' : 'open-failed'
    this.host.catalog.signInDone()
    this.host.changed()

    if (this.outcome === 'landed') void this.host.signedIn()
  }

  /** Ссылка входа - только сайт (общий путь наружу проверяет схему); отказ - строкой входа. */
  private open(url: string): void {
    if (this.host.openUrl(url)) return

    this.outcome = 'open-failed'
    this.host.changed()
  }
}
