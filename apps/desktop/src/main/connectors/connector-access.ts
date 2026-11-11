import type { GoogleAppError, GoogleAppState } from '@shared/connectors'

import type { LiveConnector } from './connector-live'
import type { ConnectorRegistry } from './connector-registry'
import type { StoredConnector } from './connector-store'
import { GoogleApp } from './google-app'
import { sharesGoogleGrant } from './google-grant'
import { SignInDesk } from './sign-in'
import type { Vault } from './vault'
import { signsInWithBrowser } from './kinds/sources'
import { revokeGoogleToken } from './oauth/google-oauth'
import type { GoogleClient } from './oauth/google-oauth'

export type AccessHost = {
  registry: ConnectorRegistry
  vault: Vault
  live: (id: string) => LiveConnector | null
  openExternal: (url: string) => boolean
  pickGoogleClientFile: () => Promise<string | null>
  /** Вход поменялся: живые процессы провайдеров переподключают этот сервер. */
  serverChanged: (serverName: string) => void
  changed: () => void
}

const isGoogle = (connector: StoredConnector): boolean =>
  connector.kind === 'gmail' || connector.kind === 'calendar'

/**
 * Всё про входы коннекторов: вход в браузере, выход, свой клиент Google. После входа
 * источник собирается заново, инструменты перечитываются, а провайдеры переподключают
 * сервер - модель сразу видит инструменты без перезапуска разговора.
 */
export class ConnectorAccess {
  private readonly desk: SignInDesk
  private readonly google: GoogleApp

  constructor(private readonly host: AccessHost) {
    this.google = new GoogleApp(host.vault, host.registry.googleClientId, (id) =>
      host.registry.setGoogleClientId(id),
    )
    this.desk = new SignInDesk({
      googleClient: () => this.google.client(),
      openExternal: host.openExternal,
    })
  }

  googleClient(): GoogleClient | null {
    return this.google.client()
  }

  googleState(): GoogleAppState {
    return this.google.state()
  }

  isSigningIn(id: string): boolean {
    return this.desk.isSigningIn(id)
  }

  cancel(id: string): void {
    this.desk.cancel(id)
  }

  /** Открыть браузер и ждать в фоне: итог придёт событием состояния. */
  signIn(connector: StoredConnector): void {
    const live = this.host.live(connector.id)

    if (!live || !signsInWithBrowser(connector)) return

    void this.desk
      .signIn(connector, live.secrets)
      .then(async (result) => {
        // Коннектор удалили, пока шёл вход: то, что вход успел записать, - отозвать и стереть.
        if (!this.host.registry.find(connector.id)) {
          await this.revoke(connector, live)

          return live.secrets.forget()
        }

        if ('failure' in result) {
          live.failure = result.failure

          return
        }

        await live.reset()
        await this.host.registry.update(connector.id, {
          account: result.account ?? connector.account,
        })
        await live.refresh()
        this.host.serverChanged(connector.serverName)
      })
      .catch((error: unknown) => {
        console.warn('[connectors] вход не довершён', connector.serverName, error)
        live.failure = 'sign-in-failed'
      })
      .finally(() => this.host.changed())
  }

  /** Забыть вход: токены стираются, у Google он ещё и отзывается. */
  async signOut(connector: StoredConnector): Promise<void> {
    const live = this.host.live(connector.id)

    if (!live || !signsInWithBrowser(connector)) return

    this.desk.cancel(connector.id)
    await this.revoke(connector, live)
    await live.secrets.update({ tokens: undefined, tokensSavedAt: undefined, google: undefined })
    await live.reset()
    await this.host.registry.update(connector.id, { account: null })
    this.host.serverChanged(connector.serverName)
  }

  /**
   * Новый ключ своего MCP (Bearer) или коннектора от ИИ: прежний не приняли или он
   * сменился. Выбор инструментов остаётся, источник собирается заново.
   */
  async setToken(connector: StoredConnector, token: string): Promise<void> {
    const live = this.host.live(connector.id)
    const usesToken = connector.auth === 'token' || connector.kind === 'http'

    if (!usesToken || !live || !token.trim() || !this.host.vault.available) return

    await live.secrets.update(
      connector.kind === 'http' ? { apiKey: token.trim() } : { bearer: token.trim() },
    )
    await live.reset()
    await live.refresh()
  }

  /** Перед удалением коннектора: остановить вход и отозвать вход Google. */
  async release(connector: StoredConnector): Promise<void> {
    const live = this.host.live(connector.id)

    this.desk.cancel(connector.id)

    if (live) await this.revoke(connector, live)
  }

  async importGoogleApp(): Promise<GoogleAppError | null> {
    const path = await this.host.pickGoogleClientFile()

    if (!path) return 'cancelled'

    const error = await this.google.importFile(path)

    if (error) return error

    await this.followGoogleClient()

    return null
  }

  async forgetGoogleApp(): Promise<void> {
    await this.google.forget()
    await this.followGoogleClient()
  }

  /**
   * Клиент Google сменился или ушёл: идущий вход Google отменяется (его код выдан старому
   * клиенту), а входы, выданные другому клиенту, стираются - обновить их новый не сможет.
   * Входы своего клиента остаются: «забыть» и снова взять тот же файл ничего не ломает.
   */
  private async followGoogleClient(): Promise<void> {
    const client = this.google.client()
    const googleIds = new Set(this.host.registry.connectors.filter(isGoogle).map(({ id }) => id))

    this.desk.cancelGoogle((id) => googleIds.has(id))

    for (const connector of this.host.registry.connectors.filter(isGoogle)) {
      const live = this.host.live(connector.id)
      const tokens = live?.secrets.read().google

      if (client && tokens && tokens.clientId !== client.clientId) {
        await live?.secrets.update({ google: undefined })
      }

      await live?.reset()
      this.host.serverChanged(connector.serverName)
    }
  }

  /** Отозвать вход у Google - только если его не делит соседний коннектор (google-grant.ts). */
  private async revoke(connector: StoredConnector, live: LiveConnector): Promise<void> {
    const google = live.secrets.read().google

    if (!google) return

    const holders = this.host.registry.connectors.filter(isGoogle).map((other) => ({
      id: other.id,
      account: other.account,
      clientId: this.host.live(other.id)?.secrets.read().google?.clientId ?? null,
    }))
    const me = { id: connector.id, account: connector.account, clientId: google.clientId }

    if (!sharesGoogleGrant(me, holders)) await revokeGoogleToken(google.refreshToken)
  }
}
