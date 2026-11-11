import { runsCommand } from '@shared/connectors'
import type { ConnectorFailure } from '@shared/connectors'
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { SecretsOf } from './connector-secrets'
import { toolError, SignedOutError } from './connector-source'
import type { SourceTool, SourceLaunch, ConnectorSource } from './connector-source'
import type { StoredTool, StoredConnector } from './connector-store'
import { enabledTools, instructionsFor, disabledToolText } from './connector-view'
import type { LiveFacts } from './connector-view'
import type { GatewayServer } from './gateway/gateway'
import type { Launch } from './gateway/launches'
import { hasSignIn, createSource } from './kinds/sources'
import type { SourceDeps } from './kinds/sources'
import { GoogleAppMissingError, GoogleAppRejectedError } from './kinds/google/google-session'

/** Как часто перечитывать инструменты чужого сервера: они меняются с его версией, не чаще. */
const TOOLS_FRESH_MS = 10 * 60_000

export type LiveHost = {
  /** Коннектор из реестра - свежий: подпись, выбор инструментов и включённость меняются. */
  stored: () => StoredConnector | null
  /** Имя своего типа (Playwright) - для пояснения модели; у встроенных - null. */
  typeName: () => string | null
  signingIn: () => boolean
  /** Сервис отдал инструменты: реестр запоминает их для окна. */
  toolsListed: (tools: StoredTool[]) => void
  changed: () => void
  /** Чей коннектор сейчас, если это знает только живая IDE (профили Chrome у Browser). */
  account?: () => string | null
}

const toMcpTool = ({ access: _access, ...tool }: SourceTool): Tool => tool

/** Процесс разговора для источника: без служебной пометки шлюза. */
const sourceLaunch = ({ id, projectPath, workDir, conversationId }: Launch): SourceLaunch => ({
  id,
  projectPath,
  workDir,
  conversationId,
})

const SIGN_IN_TEXT =
  'Sign-in expired. Ask the user to sign in again in Agentic Workstation → Connectors.'

const GOOGLE_APP_TEXT =
  'The Google sign-in app of Agentic Workstation is missing or was rejected by Google. Ask the user to check Agentic Workstation → Connectors → Google sign-in.'

const isGoogleAppFailure = (failure: ConnectorFailure | null): boolean =>
  failure === 'google-app-missing' || failure === 'google-app-rejected'

/** Сбой, который чинится в настройках, а не повтором вызова: его видно на карточке. */
const failureOf = (error: unknown): ConnectorFailure | null => {
  if (error instanceof GoogleAppMissingError) return 'google-app-missing'

  return error instanceof GoogleAppRejectedError ? 'google-app-rejected' : null
}

/**
 * Процессы команды - у каждого разговора свои, как у Claude Code: внутри разговора (и его
 * субагентов) сервер один, а параллельной работе нужны разные коннекторы - playwright-1 и
 * playwright-2.
 */
const isPerLaunch = (connector: StoredConnector | null): boolean =>
  connector ? runsCommand(connector.kind) : false

/**
 * Живой коннектор: источник инструментов, последний сбой и то, что шлюз отвечает
 * провайдеру. Вход пропал посреди работы (токен отозвали) - коннектор помнит это до
 * нового входа, даже если в хранилище что-то осталось. У команды источник свой у каждого
 * процесса разговора (launch): два разговора не делят один браузер Playwright. Такой
 * источник гасится, когда процесс разговора кончился.
 */
export class LiveConnector {
  failure: ConnectorFailure | null = null
  private lostSignIn = false
  private source: ConnectorSource
  private readonly launchSources = new Map<string, ConnectorSource>()
  private tools: SourceTool[] = []
  private listedAt = 0
  private disposed = false
  /** Идущее чтение списка для шлюза: процессы разговоров, пришедшие разом, ждут одного. */
  private listing: Promise<void> | null = null

  constructor(
    connector: StoredConnector,
    readonly secrets: SecretsOf,
    private readonly deps: SourceDeps,
    private readonly host: LiveHost,
  ) {
    this.source = createSource(connector, secrets, deps)
  }

  facts(connector: StoredConnector): LiveFacts {
    return {
      signedIn: !this.lostSignIn && hasSignIn(connector, this.secrets.read()),
      signingIn: this.host.signingIn(),
      failure: this.failure,
      ...(this.host.account ? { account: this.host.account() } : {}),
    }
  }

  /**
   * Перечитать инструменты у источника. Ошибку не бросает - она в статусе. По кнопке
   * человека (retry) пометка «вход пропал» снимается: ключ мог снова заработать, сервер -
   * подняться; не вышло - пометка вернётся. Выключенный коннектор не трогается: его
   * команда не должна запускаться. projectPath - чей процесс разговора спросил список.
   */
  async refresh(retry = false, projectPath: string | null = null): Promise<void> {
    if (retry) this.lostSignIn = false

    const connector = this.host.stored()

    if (!connector?.enabled || !this.facts(connector).signedIn) return

    try {
      this.tools = await this.listTools(connector, projectPath)
      this.listedAt = Date.now()
      // Беда с клиентом Google снимается живым вызовом или новым клиентом (reset), а не
      // списком инструментов: у Google он свой и в сеть не ходит.
      if (!isGoogleAppFailure(this.failure)) this.failure = null
      this.host.toolsListed(
        this.tools.map(({ name, description, access }) => ({
          name,
          description: description ?? '',
          access,
        })),
      )
    } catch (error) {
      this.signedOutOr(error, 'unreachable')
    }

    this.host.changed()
  }

  /** Вход сменился (новый, выход, другой клиент Google): источник - заново. */
  async reset(): Promise<void> {
    await this.suspend()
    this.lostSignIn = false
    this.failure = null
    this.tools = []
    this.listedAt = 0
  }

  /**
   * Погасить источники (процессы команд), не забывая инструменты и сбой: коннектор
   * выключили или сменили его вход. Следующий запрос поднимет их заново.
   */
  async suspend(): Promise<void> {
    const connector = this.host.stored()
    const sources = [this.source, ...this.launchSources.values()]

    this.launchSources.clear()

    if (connector && !this.disposed) this.source = createSource(connector, this.secrets, this.deps)

    await Promise.allSettled(sources.map((source) => source.dispose()))
  }

  /** Коннектор удалён: источники гасятся, а новые не поднимаются - даже вызовом шлюза. */
  dispose(): Promise<void> {
    const sources = [this.source, ...this.launchSources.values()]

    this.disposed = true
    this.launchSources.clear()

    return Promise.allSettled(sources.map((source) => source.dispose())).then(() => undefined)
  }

  /**
   * Процесс разговора кончился: его процесс команды больше не нужен, а общий источник
   * отпускает то, что держал на этот процесс (вкладки браузера ждут следующий процесс того же
   * разговора).
   */
  release(launch: Launch): void {
    const source = this.launchSources.get(launch.id)

    this.launchSources.delete(launch.id)
    void source?.dispose()
    this.source.release?.(sourceLaunch(launch))
  }

  /** Разговор закрыт насовсем: общий источник отпускает то, что держал на него. */
  endConversation(conversationId: string): void {
    this.source.endConversation?.(conversationId)
  }

  /** Сервер этого коннектора на шлюзе для процесса разговора launch. */
  gatewayServer(launch: Launch): GatewayServer {
    return {
      instructions: () => {
        const connector = this.host.stored()

        return connector
          ? instructionsFor(connector, this.facts(connector), this.host.typeName())
          : ''
      },
      tools: () => this.listForGateway(launch),
      call: (name, args, signal) => this.call(name, args, launch, signal),
    }
  }

  /**
   * Инструменты для карточки и для модели. У команды - разовым процессом, который сразу гасится: процессы разговоров поднимаются только по вызову, а
   * висеть лишней копией сервера (с браузером) незачем. Спросил процесс разговора - разовый
   * процесс в папке его проекта, как и вызовы: команде с «.» в аргументах это важно.
   */
  private async listTools(
    connector: StoredConnector,
    projectPath: string | null,
  ): Promise<SourceTool[]> {
    if (!isPerLaunch(connector)) return this.source.listTools()

    const lister = createSource(connector, this.secrets, this.deps, projectPath)

    try {
      return await lister.listTools()
    } finally {
      void lister.dispose()
    }
  }

  /**
   * Источник для вызова: общий у коннектора или свой у процесса разговора (команда) - в
   * папке его проекта. Процесс
   * разговора уже кончился (вызов пришёл в последний миг) - null: новый процесс команды ему
   * не нужен, а погасить его потом было бы некому.
   */
  private sourceFor(launch: Launch): ConnectorSource | null {
    const connector = this.host.stored()

    if (this.disposed || !connector || !isPerLaunch(connector)) return this.source

    if (launch.released) return null

    let source = this.launchSources.get(launch.id)

    if (!source) {
      source = createSource(connector, this.secrets, this.deps, launch.projectPath)
      this.launchSources.set(launch.id, source)
    }

    return source
  }

  private async listForGateway(launch: Launch): Promise<Tool[]> {
    const connector = this.host.stored()

    if (!connector?.enabled || !this.facts(connector).signedIn) return []

    if (Date.now() - this.listedAt > TOOLS_FRESH_MS) {
      this.listing ??= this.refresh(false, launch.projectPath).finally(() => {
        this.listing = null
      })
      await this.listing
    }

    return enabledTools(this.tools, connector.toolOverrides).map(toMcpTool)
  }

  private async call(
    name: string,
    args: Record<string, unknown>,
    launch: Launch,
    signal: AbortSignal,
  ): Promise<CallToolResult> {
    const connector = this.host.stored()

    if (!connector?.enabled)
      return toolError('This connector is turned off in Agentic Workstation.')

    const tool = connector.tools.find((candidate) => candidate.name === name)

    if (!tool || !enabledTools([tool], connector.toolOverrides).length) {
      return toolError(disabledToolText(connector, tool, this.host.typeName()))
    }

    const source = this.sourceFor(launch)

    if (!source) return toolError('This conversation has ended.')

    try {
      const result = await source.callTool(name, args, signal, sourceLaunch(launch))

      // Вызов прошёл - клиент Google снова в порядке, пометка с карточки снимается.
      if (isGoogleAppFailure(this.failure)) {
        this.failure = null
        this.host.changed()
      }

      return result
    } catch (error) {
      this.signedOutOr(error, null)
      this.host.changed()

      if (error instanceof SignedOutError) return toolError(SIGN_IN_TEXT)

      if (failureOf(error)) return toolError(GOOGLE_APP_TEXT)

      return toolError(error instanceof Error ? error.message : 'The service did not answer.')
    }
  }

  /**
   * Вход пропал - помнить до нового входа; сбой, который чинится в настройках (клиент
   * Google), - на карточку всегда; сбой связи - на карточку только при чтении инструментов:
   * одна упавшая запись не делает весь коннектор «не отвечает».
   */
  private signedOutOr(error: unknown, failure: ConnectorFailure | null): void {
    if (error instanceof SignedOutError) {
      this.lostSignIn = true
      this.failure = null

      return
    }

    console.warn('[connectors] сервис не ответил', this.host.stored()?.serverName, error)

    const fixable = failureOf(error)

    if (fixable ?? failure) this.failure = fixable ?? failure
  }
}
