import { randomUUID } from 'node:crypto'

import type { ConnectorAvailability } from '@shared/connector-availability'
import { isAvailableIn } from '@shared/connector-availability'
import { runsCommand } from '@shared/connectors'
import type {
  ConnectorsState,
  AddToTypeRequest,
  GoogleAppOutcome,
  AddConnectorError,
  UpdateTypeRequest,
  AddConnectorOutcome,
  AddConnectorRequest,
} from '@shared/connectors'

import { AiConnectorDesk } from './ai-connector'
import { ConnectorAccess } from './connector-access'
import { newConnector, newConnection } from './connector-add'
import type { NewConnector } from './connector-add'
import { adoptPlaywright, assignCustomTypes, moveSecretsToVault } from './connector-migrate'
import { ConnectorRegistry } from './connector-registry'
import { SecretsOf, secretsKey, typeSecretsKey } from './connector-secrets'
import { parseStoredConnectors } from './connector-store'
import { typeView, capitalized } from './connector-types'
import { connectorView, NO_LIVE_FACTS } from './connector-view'
import type { ConnectorsEvents, ConnectorsPlaces } from './connectors-service.types'
import { GatewayHost } from './gateway-host'
import { LiveConnectors } from './live-connectors'
import type { McpLaunch } from './gateway/launches'
import { ImportDesk } from './import/import-desk'
import { signsInWithBrowser } from './kinds/sources'
import { BrowserDesk } from './kinds/browser/browser-desk'

/**
 * Коннекторы к приложениям (ADR 0028, 0029): реестр, живые коннекторы и локальный
 * MCP-шлюз, через который их видит провайдер - у каждого проекта свой набор. Входы - в
 * ConnectorAccess. Состояние живёт здесь, окно получает его целиком после каждого
 * изменения. Ни один вход не связан с аккаунтом провайдера.
 */
export class ConnectorsService {
  private readonly live: LiveConnectors
  private readonly access: ConnectorAccess
  private readonly gateway: GatewayHost
  /** Коннектор, который описывает ИИ по документации сервиса. */
  readonly ai: AiConnectorDesk
  /** Перенос MCP-серверов из конфига Claude Code. */
  readonly imports: ImportDesk
  private readonly browser: BrowserDesk

  private constructor(
    private readonly registry: ConnectorRegistry,
    private readonly places: ConnectorsPlaces,
    private readonly events: ConnectorsEvents,
  ) {
    this.live = new LiveConnectors(
      registry,
      places,
      () => this.access,
      () => this.broadcast(),
    )
    this.access = new ConnectorAccess({
      registry,
      vault: places.vault,
      live: (id) => this.live.get(id),
      openExternal: events.openExternal,
      pickGoogleClientFile: events.pickGoogleClientFile,
      serverChanged: events.onServerChanged,
      changed: () => this.broadcast(),
    })
    this.gateway = new GatewayHost(
      registry,
      (id) => this.live.get(id),
      places.mcpConfigDir,
      places.version,
      this.live,
    )

    this.ai = new AiConnectorDesk(places.ask, () => this.broadcast())
    this.imports = new ImportDesk({
      serverNames: () => registry.serverNames(),
      add: (prepared) => this.addPrepared(prepared, { signIn: false }),
      projectPaths: places.projectPaths,
      isTrusted: places.isTrusted,
      shellEnv: places.shellEnv,
    })

    this.browser = new BrowserDesk(places.browser, registry)

    for (const connector of registry.connectors) this.live.attach(connector)
  }

  static async load(
    places: ConnectorsPlaces,
    events: ConnectorsEvents,
  ): Promise<ConnectorsService> {
    const registry = new ConnectorRegistry(
      parseStoredConnectors(await places.file.read()),
      places.file,
    )

    await moveSecretsToVault(registry, places.vault).catch((error: unknown) => {
      console.warn('[connectors] ключи из реестра не перенесены в хранилище', error)
    })
    // Своя команда Playwright - встроенным Playwright (ADR 0035), остальные свои коннекторы
    // прежнего реестра получают свои типы (ADR 0034).
    await adoptPlaywright(registry, places.vault).catch((error: unknown) => {
      console.warn('[connectors] команды Playwright не перенесены', error)
    })
    await assignCustomTypes(registry, places.vault, randomUUID).catch((error: unknown) => {
      console.warn('[connectors] свои коннекторы не получили типы', error)
    })

    return new ConnectorsService(registry, places, events)
  }

  /** Поднять шлюз до первого процесса провайдера. Сбой - разговоры без коннекторов. */
  async start(): Promise<void> {
    try {
      await this.gateway.start()
    } catch (error) {
      console.warn('[connectors] шлюз не поднялся', error)
    }

    for (const live of this.live.all()) void live.refresh()

    this.browser.sync()
  }

  /** Сессии браузера закрываются раньше моста: им ещё отпускать вкладки в Chrome. */
  async stop(): Promise<void> {
    this.ai.dismiss()
    await this.live.disposeAll()
    await this.gateway.stop()
    await this.browser.stop()
  }

  /**
   * Конфиг `--mcp-config` для нового процесса разговора в этом проекте (gateway-host.ts);
   * own - чей это разговор, release - процесс кончился, end - разговор закрыт. Не записался -
   * ошибка: разговор поднимется без коннекторов.
   */
  mcpConfigFor(projectPath: string): Promise<McpLaunch | null> {
    return this.gateway.open(projectPath)
  }

  getState(): ConnectorsState {
    return {
      connectors: this.registry.connectors.map((connector) =>
        connectorView(
          connector,
          this.live.get(connector.id)?.facts(connector) ?? NO_LIVE_FACTS,
          this.registry.findType(connector.typeId),
        ),
      ),
      types: this.registry.types.map(typeView),
      google: this.access.googleState(),
      vault: this.places.vault.available,
      vaultReset: this.places.vault.wasReset,
      generation: this.ai.state,
      browser: this.browser.state(),
    }
  }

  async add(request: AddConnectorRequest): Promise<AddConnectorOutcome> {
    // Команда раскрывает ~ и $NAME, как в терминале: нужно окружение оболочки.
    const env = runsCommand(request.kind) ? await this.places.shellEnv() : {}
    const taken = { servers: this.registry.serverNames(), bases: this.registry.serverBases() }
    const ids = { connector: randomUUID(), type: randomUUID() }
    const outcome = await this.addOutcome(newConnector(request, ids, taken, env))

    // Описание от ИИ ушло в коннектор - его работа больше не ждёт человека.
    if (request.kind === 'http' && !outcome.error) this.ai.dismiss()

    return outcome
  }

  /** Ещё одно подключение своего типа «несколько раз» (ADR 0034): копия образца, свой вход. */
  addToType(request: AddToTypeRequest): Promise<AddConnectorOutcome> {
    const type = this.registry.findType(request.typeId)
    const typeSecrets = type
      ? new SecretsOf(this.places.vault, type.id, typeSecretsKey(type.id))
      : null

    return this.addOutcome(
      type && typeSecrets
        ? newConnection(
            type,
            typeSecrets.read(),
            request,
            randomUUID(),
            this.registry.serverNames(),
          )
        : 'failed',
    )
  }

  /**
   * Удалить свой тип из каталога вместе с его подключениями: без типа у них не было бы ни
   * имени, ни образца.
   */
  async removeType(typeId: string): Promise<ConnectorsState> {
    for (const connector of this.registry.connectionsOf(typeId)) await this.remove(connector.id)

    await this.forgetType(typeId)

    return this.broadcast()
  }

  /**
   * Имя своего типа и «несколько раз». Имена серверов не меняются: на них опираются правила
   * и хуки человека. «Один раз» - только пока подключений не больше одного. Имя - в
   * пояснении модели: живые разговоры переподключают серверы типа.
   */
  async updateType({ typeId, name, multiple }: UpdateTypeRequest): Promise<ConnectorsState> {
    const type = this.registry.findType(typeId)

    if (!type) return this.getState()

    const connections = this.registry.connectionsOf(typeId)
    const nextName = name === undefined ? '' : capitalized(name)
    const patch = {
      ...(nextName && nextName !== type.name ? { name: nextName } : {}),
      ...(multiple !== undefined && (multiple || connections.length <= 1) ? { multiple } : {}),
    }

    if (!Object.keys(patch).length) return this.getState()

    await this.registry.updateType(typeId, patch)

    if (patch.name)
      for (const { serverName } of connections) this.events.onServerChanged(serverName)

    return this.broadcast()
  }

  /**
   * Добавить готовый коннектор (форма или импорт): секреты - в хранилище, процессы проектов,
   * где он виден, - перезапустить, вход в браузере - начать. Отказ - кодом.
   */
  async addPrepared(
    { connector, secrets, type }: NewConnector,
    { signIn = true }: { signIn?: boolean } = {},
  ): Promise<AddConnectorOutcome['error']> {
    const hasSecrets = Object.keys(secrets).length > 0

    if ((signsInWithBrowser(connector) || hasSecrets) && !this.places.vault.available) {
      return 'vault-unavailable'
    }

    if (
      (connector.kind === 'gmail' || connector.kind === 'calendar') &&
      !this.access.googleClient()
    ) {
      return 'google-app-missing'
    }

    if (hasSecrets) await new SecretsOf(this.places.vault, connector.id).update(secrets)

    if (type && Object.keys(type.secrets).length) {
      await new SecretsOf(this.places.vault, type.stored.id, typeSecretsKey(type.stored.id)).update(
        type.secrets,
      )
    }

    await this.registry.add(connector, type?.stored ?? null)

    const live = this.live.attach(connector)

    this.events.onServersChanged((path) => isAvailableIn(connector.availability, path))
    this.browser.sync()

    if (!signsInWithBrowser(connector)) void live.refresh()
    else if (signIn) this.access.signIn(connector)

    return null
  }

  /**
   * Удалить коннектор. Сначала он пропадает из реестра и из живых - шлюз сразу отвечает
   * «нет такого сервера», и вызов посреди удаления не поднимет процесс команды заново, -
   * потом гасятся источники, отзывается вход и стираются секреты.
   */
  async remove(id: string): Promise<ConnectorsState> {
    const connector = this.registry.find(id)

    if (!connector) return this.getState()

    const removing = this.registry.remove(id)

    await this.access.release(connector)
    await this.live.detach(id)
    await this.places.vault.forgetPrefix(secretsKey(id)).catch(() => undefined)
    await removing
    this.events.onServersChanged((path) => isAvailableIn(connector.availability, path))
    this.browser.sync()

    // Свой тип «один раз» живёт, пока живёт его подключение; «несколько раз» - в каталоге.
    const type = this.registry.findType(connector.typeId)

    if (type && !type.multiple && !this.registry.connectionsOf(type.id).length) {
      await this.forgetType(type.id)
    }

    return this.broadcast()
  }

  /**
   * Описание человека. Модель читает его в пояснении сервера при подключении, поэтому
   * живые разговоры переподключают сервер - как при смене инструментов.
   */
  async setDescription(id: string, description: string): Promise<ConnectorsState> {
    const connector = this.registry.find(id)

    if (!connector || connector.description === description) return this.getState()

    await this.registry.update(id, { description })

    return this.changedServer(id)
  }

  /** В каких проектах коннектор виден: перезапуск - только там, где это поменялось. */
  async setAvailability(id: string, availability: ConnectorAvailability): Promise<ConnectorsState> {
    const connector = this.registry.find(id)

    if (!connector) return this.getState()

    await this.registry.update(id, { availability })
    this.events.onServersChanged(
      (path) => isAvailableIn(connector.availability, path) !== isAvailableIn(availability, path),
    )

    return this.broadcast()
  }

  signIn(id: string): ConnectorsState {
    const connector = this.registry.find(id)

    if (connector) this.access.signIn(connector)

    return this.broadcast()
  }

  cancelSignIn(id: string): ConnectorsState {
    this.access.cancel(id)

    return this.getState()
  }

  async signOut(id: string): Promise<ConnectorsState> {
    const connector = this.registry.find(id)

    if (connector) await this.access.signOut(connector)

    return this.broadcast()
  }

  /** Выключенный коннектор гасит свои процессы команд; включённый - перечитывает инструменты. */
  async setEnabled(id: string, enabled: boolean): Promise<ConnectorsState> {
    await this.registry.update(id, { enabled })

    if (enabled) await this.live.get(id)?.refresh()
    else await this.live.get(id)?.suspend()

    this.browser.sync()

    return this.changedServer(id)
  }

  async setToolEnabled(id: string, tool: string, enabled: boolean): Promise<ConnectorsState> {
    const connector = this.registry.find(id)

    if (connector) {
      await this.registry.update(id, {
        toolOverrides: { ...connector.toolOverrides, [tool]: enabled },
      })
    }

    return this.changedServer(id)
  }

  /** По кнопке человека: снять пометку «вход пропал» и попробовать снова. */
  async refresh(id: string): Promise<ConnectorsState> {
    await this.live.get(id)?.refresh(true)

    return this.changedServer(id)
  }

  /** Новый ключ своего MCP или коннектора от ИИ (ConnectorAccess.setToken). */
  async setToken(id: string, token: string): Promise<ConnectorsState> {
    const connector = this.registry.find(id)

    if (connector) await this.access.setToken(connector, token)

    return this.changedServer(id)
  }

  async importGoogleApp(): Promise<GoogleAppOutcome> {
    const error = await this.access.importGoogleApp()

    return { state: error ? this.getState() : this.broadcast(), error }
  }

  async forgetGoogleApp(): Promise<ConnectorsState> {
    await this.access.forgetGoogleApp()

    return this.broadcast()
  }

  /** Ответ на добавление: готовое - в реестр и окну, отказ - кодом. */
  private async addOutcome(result: NewConnector | AddConnectorError): Promise<AddConnectorOutcome> {
    const error = typeof result === 'string' ? result : await this.addPrepared(result)

    if (error || typeof result === 'string') return { state: this.getState(), error, id: null }

    return { state: this.broadcast(), error: null, id: result.connector.id }
  }

  private async forgetType(typeId: string): Promise<void> {
    await this.registry.removeType(typeId)
    await this.places.vault.forgetPrefix(typeSecretsKey(typeId)).catch(() => undefined)
  }

  private changedServer(id: string): ConnectorsState {
    const connector = this.registry.find(id)

    if (connector) this.events.onServerChanged(connector.serverName)

    return this.broadcast()
  }

  private broadcast(): ConnectorsState {
    const state = this.getState()

    this.events.onState(state)

    return state
  }
}
