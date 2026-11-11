import type { ConnectorFailure } from '@shared/connectors'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'

import type { SecretsOf } from './connector-secrets'
import type { StoredConnector } from './connector-store'
import {
  OAUTH_REDIRECT_URL,
  SIGN_IN_TIMEOUT_MS,
  OAUTH_CALLBACK_PATH,
  OAUTH_CALLBACK_PORT,
} from './connectors.constants'
import { remoteUrlOf } from './kinds/sources'
import {
  hasScopes,
  googleAuthUrl,
  exchangeGoogleCode,
  GoogleClientRejectedError,
} from './oauth/google-oauth'
import type { GoogleClient } from './oauth/google-oauth'
import { McpAuthProvider } from './oauth/mcp-auth-provider'
import { OAuthCallback, CallbackBusyError } from './oauth/oauth-callback'
import { pkcePair, randomToken } from './oauth/pkce'
import { capturingFetch } from './oauth/token-account'
import { checkGoogleAccount } from './kinds/google/google-account'
import { GOOGLE_SCOPES } from './kinds/google/google.constants'

/** Чем кончился вход. failure null - вход отменили: это не ошибка. */
export type SignInResult = { account: string | null } | { failure: ConnectorFailure | null }

export type SignInDeps = {
  googleClient: () => GoogleClient | null
  openExternal: (url: string) => boolean
}

/** Идущий вход. Порт возврата занимается не сразу - отменить вход можно и до этого. */
type Pending = {
  id: string
  callback: OAuthCallback | null
  cancelled: boolean
  timedOut: boolean
  /** Вход кончился и отпустил порт: следующий может его занимать. */
  settled: Promise<void>
}

const cancelled: SignInResult = { failure: null }

/** Ожидание кода из браузера: отказ, тайм-аут и отмена - кодом причины. */
const awaitCode = async (
  pending: Pending,
  callback: OAuthCallback,
): Promise<{ code: string } | { failure: ConnectorFailure | null }> => {
  const result = await callback.result

  if ('code' in result) return result

  if (pending.timedOut) return { failure: 'sign-in-timeout' }

  return { failure: result.error === 'denied' ? 'sign-in-denied' : null }
}

/**
 * Вход коннекторов в браузере. Вход один за раз: порт возврата один на все (Notion и
 * Slack сверяют адрес строго), и новый вход отменяет прежний и ждёт, пока тот отпустит
 * порт. Идущим вход становится сразу, ещё до порта: окно тут же видит «идёт вход».
 * Браузер открывается только отсюда - по кнопке человека, а не сам посреди работы.
 */
export class SignInDesk {
  private pending: Pending | null = null

  constructor(private readonly deps: SignInDeps) {}

  /** Идёт ли вход этого коннектора. */
  isSigningIn(id: string): boolean {
    return this.pending?.id === id
  }

  cancel(id: string): void {
    if (this.pending?.id !== id) return

    this.pending.cancelled = true
    void this.pending.callback?.close()
  }

  /** Отменить идущий вход Google: клиент сменился, код от старого новому не годится. */
  cancelGoogle(isGoogle: (id: string) => boolean): void {
    if (this.pending && isGoogle(this.pending.id)) this.cancel(this.pending.id)
  }

  async signIn(connector: StoredConnector, secrets: SecretsOf): Promise<SignInResult> {
    const previous = this.pending
    let settle = (): void => undefined
    const pending: Pending = {
      id: connector.id,
      callback: null,
      cancelled: false,
      timedOut: false,
      settled: new Promise((resolve) => {
        settle = resolve
      }),
    }

    // До первого await: окно сразу видит «идёт вход», а повторное нажатие отменяет этот.
    this.pending = pending

    if (previous) {
      previous.cancelled = true
      void previous.callback?.close()
      await previous.settled
    }

    try {
      return await this.run(connector, secrets, pending)
    } finally {
      await pending.callback?.close()

      if (this.pending === pending) this.pending = null

      settle()
    }
  }

  private async run(
    connector: StoredConnector,
    secrets: SecretsOf,
    pending: Pending,
  ): Promise<SignInResult> {
    const state = randomToken()

    if (pending.cancelled) return cancelled

    try {
      pending.callback = await OAuthCallback.listen(OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH, state)
    } catch (error) {
      console.warn('[connectors] порт возврата входа не занят', error)

      return { failure: error instanceof CallbackBusyError ? 'callback-busy' : 'sign-in-failed' }
    }

    if (pending.cancelled) return cancelled

    const callback = pending.callback
    const timer = setTimeout(() => {
      pending.timedOut = true
      void callback.close()
    }, SIGN_IN_TIMEOUT_MS)

    try {
      return connector.kind === 'gmail' || connector.kind === 'calendar'
        ? await this.signInGoogle(connector.kind, secrets, pending, callback, state)
        : await this.signInMcp(connector, secrets, pending, callback, state)
    } catch (error) {
      console.warn('[connectors] вход не удался', connector.serverName, error)

      return {
        failure:
          error instanceof GoogleClientRejectedError ? 'google-app-rejected' : 'sign-in-failed',
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Вход Google: код - на токены, проверка прав и аккаунта - и только потом в хранилище.
   * Снятая галочка на экране согласия или выключенный API - своя причина, а не «вход есть,
   * но ничего не работает».
   */
  private async signInGoogle(
    kind: 'gmail' | 'calendar',
    secrets: SecretsOf,
    pending: Pending,
    callback: OAuthCallback,
    state: string,
  ): Promise<SignInResult> {
    const client = this.deps.googleClient()

    if (!client) return { failure: 'google-app-missing' }

    const { verifier, challenge } = pkcePair()
    const url = googleAuthUrl(client, {
      scopes: GOOGLE_SCOPES[kind],
      state,
      challenge,
      redirectUri: OAUTH_REDIRECT_URL,
    })

    if (!this.deps.openExternal(url)) return { failure: 'sign-in-failed' }

    const outcome = await awaitCode(pending, callback)

    if ('failure' in outcome) return outcome

    const tokens = await exchangeGoogleCode(client, outcome.code, verifier, OAUTH_REDIRECT_URL)

    if (pending.cancelled) return cancelled

    if (!hasScopes(tokens.scope, GOOGLE_SCOPES[kind])) return { failure: 'google-scope-missing' }

    const check = await checkGoogleAccount(kind, tokens.accessToken)

    if ('failure' in check) return check

    if (pending.cancelled) return cancelled

    await secrets.update({ google: tokens })

    return { account: check.account }
  }

  /**
   * Вход в MCP-сервер через OAuth из SDK. Новые токены копятся в памяти провайдера и
   * ложатся в хранилище только при успехе: «войти заново» не ломает рабочий вход, пока
   * человек в браузере, и не теряет его, если он передумал.
   */
  private async signInMcp(
    connector: StoredConnector,
    secrets: SecretsOf,
    pending: Pending,
    callback: OAuthCallback,
    state: string,
  ): Promise<SignInResult> {
    const serverUrl = remoteUrlOf(connector, secrets.read())

    if (!serverUrl) return { failure: 'sign-in-failed' }

    let account: string | null = null
    let opened = true
    const fetchFn = capturingFetch((name) => {
      account = name
    })
    const provider = new McpAuthProvider(secrets, {
      state,
      // Вход отменили, пока искались адреса: вкладка с мёртвым входом не нужна.
      open: (url) => {
        opened = !pending.cancelled && this.deps.openExternal(url.toString())
      },
    })

    if ((await auth(provider, { serverUrl, fetchFn })) === 'REDIRECT') {
      if (pending.cancelled) return cancelled

      // Адрес входа диктует сервер: не сайт - браузер его не откроет, ждать нечего.
      if (!opened) return { failure: 'sign-in-failed' }

      const outcome = await awaitCode(pending, callback)

      if ('failure' in outcome) return outcome

      await auth(provider, { serverUrl, authorizationCode: outcome.code, fetchFn })
    }

    if (pending.cancelled) return cancelled

    await provider.commitTokens()

    return { account }
  }
}
