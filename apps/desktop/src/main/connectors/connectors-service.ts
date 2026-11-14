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
  ConnectorInProject,
  AddConnectorOutcome,
  AddConnectorRequest,
} from '@shared/connectors'

import type { ComputerRuntime } from '../computer/computer-runtime'
import { ConnectorAccess } from './connector-access'
import { newConnector } from './connector-add'
import type { NewConnector } from './connector-add'
import { withInProject } from './connector-in-project'
import { migrateRegistry } from './connector-migrate'
import { ConnectorRegistry } from './connector-registry'
import { SecretsOf, secretsKey, typeSecretsKey } from './connector-secrets'
import { parseStoredConnectors } from './connector-store'
import { ConnectorTypeDesk } from './connector-type-desk'
import { typeView } from './connector-types'
import { connectorView, NO_LIVE_FACTS } from './connector-view'
import type { ConnectorsEvents, ConnectorsPlaces } from './connectors-service.types'
import { GatewayHost } from './gateway-host'
import { LiveConnectors } from './live-connectors'
import { AiConnectorDesk } from './ai/ai-connector-desk'
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
  /** Работы ИИ над новыми коннекторами (ADR 0050). */
  readonly ai: AiConnectorDesk
  /** Перенос MCP-серверов из конфига Claude Code. */
  readonly imports: ImportDesk
  private readonly browser: BrowserDesk
  private readonly types: ConnectorTypeDesk

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

    this.imports = new ImportDesk({
      serverNames: () => registry.serverNames(),
      add: (prepared) => this.addPrepared(prepared, { signIn: false }),
      projectPaths: places.projectPaths,
      isTrusted: places.isTrusted,
      shellEnv: places.shellEnv,
    })

    this.ai = new AiConnectorDesk({
      open: places.chats,
      file: places.aiJobsFile,
      candidates: () => this.imports.candidates(),
      changed: () => this.broadcast(),
      onFeed: events.onAiJobFeed,
    })
    this.browser = new BrowserDesk(places.browser, registry)
    this.types = new ConnectorTypeDesk({
      registry,
      vault: places.vault,
      serverChanged: events.onServerChanged,
      remove: (id) => this.remove(id),
      addOutcome: (result) => this.addOutcome(result),
    })

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

    await migrateRegistry(registry, places.vault)

    return new ConnectorsService(registry, places, events)
  }

  /**
   * Поднять шлюз до первого процесса провайдера (сбой - разговоры без коннекторов) и вернуть
   * работы ИИ с диска.
   */
  async start(): Promise<void> {
    await this.ai.load()
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
    this.ai.dispose()
    await this.live.disposeAll()
    await this.gateway.stop()
    await this.browser.stop()
    this.places.computer.stop()
  }

  /** Computer Use (ADR 0057): капсула зовёт его паузу и остановку, окно - разрешения. */
  get computer(): ComputerRuntime {
    return this.places.computer
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
      aiJobs: this.ai.list,
      browser: this.browser.state(),
      computer: this.places.computer.state(),
    }
  }

  async add(request: AddConnectorRequest): Promise<AddConnectorOutcome> {
    // Команда раскрывает ~ и $NAME, как в терминале: нужно окружение оболочки.
    const env = runsCommand(request.kind) ? await this.places.shellEnv() : {}
    const taken = { servers: this.registry.serverNames(), bases: this.registry.serverBases() }
    const ids = { connector: randomUUID(), type: randomUUID() }
    return this.addOutcome(newConnector(request, ids, taken, env))
  }

  /** Ещё одно подключение своего типа «несколько раз» (ADR 0034). */
  addToType(request: AddToTypeRequest): Promise<AddConnectorOutcome> {
    return this.types.addToType(request)
  }

  /** Удалить свой тип из каталога вместе с его подключениями. */
  async removeType(typeId: string): Promise<ConnectorsState> {
    await this.types.remove(typeId)

    return this.broadcast()
  }

  /** Имя своего типа и «несколько раз» (ConnectorTypeDesk.update). */
  async updateType(request: UpdateTypeRequest): Promise<ConnectorsState> {
    return (await this.types.update(request)) ? this.broadcast() : this.getState()
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

    await this.types.afterRemoved(connector.typeId)

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

  /**
   * Инструкции и профиль Chrome коннектора в проекте (ADR 0053). Модель читает их в пояснении
   * сервера, как описание, - живые разговоры переподключают сервер. Пустые - запись стирается.
   */
  async setInProject(
    id: string,
    projectPath: string,
    settings: ConnectorInProject,
  ): Promise<ConnectorsState> {
    const connector = this.registry.find(id)
    const inProjects = connector && withInProject(connector.inProjects, projectPath, settings)

    if (!inProjects) return this.getState()

    await this.registry.update(id, { inProjects })

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
