import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthTokens,
  OAuthClientMetadata,
  OAuthClientInformationMixed,
} from '@modelcontextprotocol/sdk/shared/auth.js'

import type { SecretsOf } from '../connector-secrets'
import { CLIENT_NAME, OAUTH_REDIRECT_URL } from '../connectors.constants'
import { TOKEN_EXPIRY_MARGIN_MS } from './oauth.constants'

/** Вход в браузере: куда отправить человека и с каким state его ждать. */
export type InteractiveSignIn = {
  state: string
  open: (url: URL) => void
}

/**
 * Сколько после сохранения токены не стираются по чужому отказу: два параллельных запроса
 * обновили токен одним токеном обновления, сервер с ротацией отказал второму - а первый
 * уже сохранил новые. Стереть их значило бы выбить рабочий вход.
 */
const FRESH_TOKENS_MS = 30_000

type Scope = 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'

/**
 * Вход в MCP-сервер (Notion, Slack, свой) поверх хранилища IDE для OAuth из SDK: SDK сам
 * находит адреса входа, регистрирует клиента, делает PKCE и обновляет токены, а мы только
 * храним. Без interactive провайдер браузер не открывает: вход истёк посреди работы -
 * коннектор станет «нужен вход», а не выскочит вкладка браузера из ниоткуда. С interactive
 * токены копятся в памяти до commitTokens: рабочий вход живёт, пока человек в браузере.
 */
export class McpAuthProvider implements OAuthClientProvider {
  private verifier = ''
  private staged: OAuthTokens | undefined

  constructor(
    private readonly secrets: SecretsOf,
    private readonly interactive: InteractiveSignIn | null = null,
  ) {}

  get redirectUrl(): string {
    return OAUTH_REDIRECT_URL
  }

  get clientMetadata(): OAuthClientMetadata {
    const preRegistered = this.secrets.read().client?.client_secret !== undefined

    return {
      client_name: CLIENT_NAME,
      redirect_uris: [OAUTH_REDIRECT_URL],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: preRegistered ? 'client_secret_post' : 'none',
    }
  }

  state(): string {
    return this.interactive?.state ?? ''
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.secrets.read().client
  }

  saveClientInformation(client: OAuthClientInformationMixed): Promise<void> {
    return this.secrets.update({ client })
  }

  tokens(): OAuthTokens | undefined {
    return this.interactive ? this.staged : this.secrets.read().tokens
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    if (this.interactive) {
      this.staged = tokens

      return
    }

    await this.secrets.update({ tokens, tokensSavedAt: Date.now() })
  }

  /** Вход в браузере удался: новые токены - в хранилище вместо прежних. */
  async commitTokens(): Promise<void> {
    if (this.staged) await this.secrets.update({ tokens: this.staged, tokensSavedAt: Date.now() })
  }

  /** Токен доступа вот-вот истечёт: пора обновить, пока запросы не получили 401. */
  expiresSoon(): boolean {
    const { tokens, tokensSavedAt } = this.secrets.read()

    if (!tokens?.refresh_token || tokens.expires_in === undefined || !tokensSavedAt) return false

    return tokensSavedAt + tokens.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS < Date.now()
  }

  redirectToAuthorization(url: URL): void {
    this.interactive?.open(url)
  }

  saveCodeVerifier(verifier: string): void {
    this.verifier = verifier
  }

  codeVerifier(): string {
    return this.verifier
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.secrets.read().discovery
  }

  saveDiscoveryState(discovery: OAuthDiscoveryState): Promise<void> {
    return this.secrets.update({ discovery })
  }

  /**
   * Сервер сказал, что прежнее не годится. Клиента Slack app человек вписал руками - его не
   * трогаем: без него вход не начать, а зарегистрировать заново Slack не даст. Токены,
   * сохранённые только что параллельным обновлением, тоже не трогаем.
   */
  async invalidateCredentials(scope: Scope): Promise<void> {
    if (scope === 'verifier') {
      this.verifier = ''

      return
    }

    const { client, tokensSavedAt = 0 } = this.secrets.read()
    const dropTokens = scope === 'all' || scope === 'tokens'
    const dropClient =
      (scope === 'all' || scope === 'client') && client?.client_secret === undefined

    if (this.interactive && dropTokens) this.staged = undefined

    const keepTokens = this.interactive !== null || Date.now() - tokensSavedAt < FRESH_TOKENS_MS

    await this.secrets.update({
      ...(dropTokens && !keepTokens ? { tokens: undefined, tokensSavedAt: undefined } : {}),
      ...(dropClient ? { client: undefined } : {}),
      ...(scope === 'all' || scope === 'discovery' ? { discovery: undefined } : {}),
    })
  }
}
