import type { ConnectorsState, GoogleAppOutcome } from '@shared/connectors'

import type { ConnectorAccess } from './connector-access'
import type { ConnectorRegistry } from './connector-registry'

/** Что входам нужно от сервиса коннекторов: состояние окну и весть «сервер поменялся». */
export type SignInsHost = {
  registry: ConnectorRegistry
  access: ConnectorAccess
  state: () => ConnectorsState
  broadcast: () => ConnectorsState
  changedServer: (id: string) => ConnectorsState
}

/**
 * Входы коннекторов по кнопкам окна: войти в браузере, отменить, выйти, новый ключ, свой
 * клиент Google. Сам вход ведёт ConnectorAccess; здесь - ответ окну новым состоянием.
 */
export class ConnectorSignIns {
  constructor(private readonly host: SignInsHost) {}

  signIn(id: string): ConnectorsState {
    const connector = this.host.registry.find(id)

    if (connector) this.host.access.signIn(connector)

    return this.host.broadcast()
  }

  cancel(id: string): ConnectorsState {
    this.host.access.cancel(id)

    return this.host.state()
  }

  async signOut(id: string): Promise<ConnectorsState> {
    const connector = this.host.registry.find(id)

    if (connector) await this.host.access.signOut(connector)

    return this.host.broadcast()
  }

  /** Новый ключ своего MCP или коннектора от ИИ (ConnectorAccess.setToken). */
  async setToken(id: string, token: string): Promise<ConnectorsState> {
    const connector = this.host.registry.find(id)

    if (connector) await this.host.access.setToken(connector, token)

    return this.host.changedServer(id)
  }

  async importGoogleApp(): Promise<GoogleAppOutcome> {
    const error = await this.host.access.importGoogleApp()

    return { state: error ? this.host.state() : this.host.broadcast(), error }
  }

  async forgetGoogleApp(): Promise<ConnectorsState> {
    await this.host.access.forgetGoogleApp()

    return this.host.broadcast()
  }
}
