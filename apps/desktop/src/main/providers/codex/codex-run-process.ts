import type { ModelInfo } from '@shared/conversation'
import { CODEX_EFFORT_LEVELS } from '@shared/conversation'

import { schemaNote } from '../run-stream/ask-once'
import {
  toolQuestion,
  engineAnswerOf,
  enginePromptOf,
  questionWithdrawn,
} from '../run-stream/claude-stream'
import type { EnginePrompt } from '../run-stream/claude-stream'
import { responseOf, engineQuestionOf } from '../run-stream/engine-questions'
import { RunJournal } from '../run-stream/run-journal'
import { runModeOf } from '../run-stream/run-modes'
import { CODEX_CLIENT } from '../../codex/codex.constants'
import type { RpcId } from '../../process/rpc-lines'
import type { CodexAccountDesk } from '../../codex/account/codex-account-desk'
import { AppServerProcess } from '../../codex/app-server/app-server-process'
import type { CodexCli } from '../../codex/cli/codex-locator'
import type { UserServer } from '../../codex/conversation/codex-connectors'
import { connectorArgs, GATEWAY_TOKEN_ENV } from '../../codex/conversation/codex-connectors'
import type { CodexHistory } from '../../codex/conversation/codex-feed'
import { policyFor, workspaceFromConfig } from '../../codex/conversation/codex-modes'
import type { CodexHeld } from '../../codex/conversation/codex-requests'
import { answerFor, holdServerRequest } from '../../codex/conversation/codex-requests'
import type { CodexItem } from '../../codex/feed/codex-tools'
import { toolItemsOf } from '../../codex/feed/codex-tools'
import type { GatewayLaunch } from '../../connectors/gateway/launches'
import type {
  SessionSpec,
  SessionWires,
  SessionProcess,
} from '../../scenarios/engine/scenario-session'
import { noBuiltInToolsArgs } from './codex-restrictions'
import { CodexTurnTranslator } from './codex-run-turns'

/** Что переводчику Codex нужно от панели Codex (codex-service.ts). */
export type CodexRunHost = {
  /** Codex с окружением входа аккаунта прогона; null - нет CLI или аккаунта. */
  cli: (accountId: string) => Promise<CodexCli | null>
  /** Коннекторы IDE процессу: серверы шлюза и ключ в памяти. */
  gateway: (projectPath: string, ideServers: readonly string[]) => GatewayLaunch | null
  /** Свои серверы MCP человека из настроек Codex: процессу IDE они выключаются. */
  /** null - не прочитались: разговор поднимется с ними, разовый вопрос откажет. */
  userMcpServers: () => Promise<readonly UserServer[] | null>
  version: () => string
  /** Каталог моделей Codex: модель и уровень по умолчанию для пустых полей сценария. */
  models: () => readonly ModelInfo[]
  /** Папка журналов сессий прогонов Codex (run-journal.ts). */
  journalDir: string
}

/**
 * Что панель Codex отдаёт прогонам (codex-service.ts `forRuns`): всё для процесса сессии и её
 * аккаунты с запасом окон лимита - для выручки на лимите (codex-run-accounts.ts).
 */
export type CodexRunFacts = Omit<CodexRunHost, 'journalDir'> & {
  desk: Pick<CodexAccountDesk, 'accounts' | 'usageOf'>
  /** Страница ходов потока - журналу шага в окне. */
  turns: CodexHistory['turns']
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Модель и усилие прогона. Модель сценария, которой нет в каталоге Codex (сценарий писали для
 * другого провайдера), - модель Codex по умолчанию; каталога ещё нет - решает сам Codex. Чужой
 * уровень не шлётся - берётся уровень модели по умолчанию.
 */
export const choiceOf = (
  spec: Pick<SessionSpec, 'model' | 'effort'>,
  models: readonly ModelInfo[],
): { model: string | null; effort: string | null } => {
  const known = models.find((one) => one.value === spec.model)
  const model = known ?? models.find((one) => one.isDefault) ?? models[0] ?? null
  const levels = model?.efforts ?? CODEX_EFFORT_LEVELS
  const effort = levels.find((level) => level === spec.effort) ?? model?.defaultEffort ?? null

  return { model: model?.value ?? null, effort }
}

/**
 * Процесс сессии прогона на Codex (docs/plan-providers/50-ide.md): `codex app-server` в папке
 * прогона на аккаунте прогона, поток разговора в нём, наружу - поток Claude, который читает
 * движок. Бриф головы - `developerInstructions` потока; id потока - в журнале сессии, по нему
 * сессия продолжается после перезапуска. Сообщения до готовности копятся и уходят по порядку.
 */
export class CodexRunProcess implements SessionProcess {
  private server: AppServerProcess | null = null
  private connectors: GatewayLaunch | null = null
  private journal: RunJournal | null = null
  private threadId = ''
  private dead = false
  private pending: EnginePrompt[] = []
  private readonly questions = new Map<string, CodexHeld>()
  private readonly items = new Map<string, CodexItem>()
  private readonly turns: CodexTurnTranslator
  private policy = policyFor('default')
  private choice: { model: string | null; effort: string | null } = { model: null, effort: null }

  constructor(
    private readonly host: CodexRunHost,
    private readonly spec: SessionSpec,
    private readonly place: { cwd: string; projectPath: string },
    private readonly wires: SessionWires,
  ) {
    this.turns = new CodexTurnTranslator(
      spec.sessionId,
      {
        emit: (message) => {
          if (!this.dead) wires.onMessage(message)
          if (message.type === 'result') this.connectors?.idle()
        },
        note: (who, said) => this.journal?.note(who, said),
      },
      spec.outputSchema !== undefined,
    )
    void this.boot().catch((error: unknown) => this.failed(error))
  }

  get isAlive(): boolean {
    return !this.dead && (this.server?.isAlive ?? true)
  }

  write(message: object): void {
    const prompt = enginePromptOf(message)

    if (this.dead || !prompt) return
    if (this.threadId) this.prompt(prompt)
    else this.pending.push(prompt)
  }

  /** Движок умеет одно управление - остановить ход. */
  async control(request: Record<string, unknown>): Promise<unknown> {
    if (request['subtype'] !== 'interrupt' || !this.server || !this.turns.isOpen) return null

    return this.server.request('turn/interrupt', {
      threadId: this.threadId,
      turnId: this.turns.turnId,
    })
  }

  respond(requestId: string, response: Record<string, unknown>): void {
    const held = this.questions.get(requestId)

    if (!held || !this.server) return

    this.questions.delete(requestId)
    this.server.respond(
      held.rpcId,
      answerFor(held, responseOf(held.pending, engineAnswerOf(response))),
    )
  }

  async stop(): Promise<void> {
    this.dead = true
    this.pending = []
    await this.server?.stop()
    this.connectors?.release()
  }

  private async boot(): Promise<void> {
    const { host, spec, place } = this
    const cli = await host.cli(spec.accountId)

    if (!cli) return this.failed(new Error('Codex is not installed or the account is gone.'))
    if (this.dead) return

    const connectors = host.gateway(place.projectPath, spec.ideServers ?? [])

    // Сессия - свой разговор у коннекторов: вкладки браузера и файлы - из её папки.
    connectors?.own({ conversationId: spec.sessionId, workDir: place.cwd })
    this.connectors = connectors

    const server = new AppServerProcess(
      {
        binary: cli.binary,
        args: [
          ...connectorArgs(connectors?.servers ?? [], (await host.userMcpServers()) ?? []),
          // Разговор о коннекторе: веб-поиск Codex и больше ничего - ни команд, ни файлов.
          ...(spec.web ? ['-c', 'web_search="live"', ...noBuiltInToolsArgs()] : []),
        ],
        cwd: place.cwd,
        env: connectors ? { ...cli.env, [GATEWAY_TOKEN_ENV]: connectors.token } : cli.env,
        client: { ...CODEX_CLIENT, version: host.version() },
      },
      {
        onNotification: (method, params) => this.notified(method, params),
        onServerRequest: (id, method, params) => this.asked(id, method, params),
        onExit: (code, stderrTail) => {
          this.connectors?.release()
          if (!this.dead) this.wires.onExit(code, stderrTail)
          this.dead = true
        },
      },
    )

    this.server = server
    // Остановили, пока искался CLI и писались коннекторы: процесс уже не нужен.
    if (this.dead) {
      void server.stop()
      connectors?.release()

      return
    }

    this.journal = await RunJournal.open(host.journalDir, spec.sessionId)

    const workspace = workspaceFromConfig(
      await server.request('config/read', { cwd: place.cwd }).catch(() => null),
    )

    this.policy = policyFor(runModeOf(spec.permissionMode), workspace)
    this.choice = choiceOf(spec, host.models())

    const threadId = await this.thread(server)

    // Сессию остановили, пока поднимался поток: stop уже погасил процесс.
    if (this.dead) return

    await this.journal.begin(threadId, place.cwd)
    this.threadId = threadId

    for (const prompt of this.pending.splice(0)) this.prompt(prompt)
  }

  /** Поток сессии: прошлый из журнала (его нет у Codex - новый) или новый. */
  private async thread(server: AppServerProcess): Promise<string> {
    const common = {
      cwd: this.place.cwd,
      model: this.choice.model,
      approvalPolicy: this.policy.approvalPolicy,
      sandbox: this.policy.sandbox,
      developerInstructions: this.spec.briefing || null,
    }
    const known = this.journal?.native
    const reply = known
      ? await server
          .request('thread/resume', { threadId: known, ...common, excludeTurns: true })
          .catch(() => server.request('thread/start', common))
      : await server.request('thread/start', common)
    const thread = isRecord(reply) && isRecord(reply['thread']) ? reply['thread'] : {}
    const id = typeof thread['id'] === 'string' ? thread['id'] : ''

    if (!id) throw new Error('codex app-server: поток прогона без id')

    return id
  }

  /** Сообщение движка: новый ход или доставка в идущий. */
  private prompt(prompt: EnginePrompt) {
    const server = this.server

    if (!server) return

    // Схема ответа - словами: строгий режим OpenAI не берёт схему разговора о коннекторе.
    const { outputSchema } = this.spec
    const text = [prompt.text, outputSchema ? schemaNote(outputSchema) : '']
      .filter(Boolean)
      .join('\n\n')
    const input = [
      ...(text ? [{ type: 'text', text, text_elements: [] }] : []),
      ...prompt.images.map((image) => ({
        type: 'image',
        url: `data:${image.mediaType};base64,${image.data}`,
      })),
    ]

    this.journal?.note('prompt', prompt.text)

    if (this.turns.isOpen) {
      void server
        .request('turn/steer', {
          threadId: this.threadId,
          input,
          expectedTurnId: this.turns.turnId,
        })
        .catch((error: unknown) => console.warn('[runs] Codex не принял слова в ход:', error))

      return
    }

    const { model, effort } = this.choice

    void server
      .request('turn/start', {
        threadId: this.threadId,
        input,
        approvalPolicy: this.policy.approvalPolicy,
        sandboxPolicy: this.policy.sandboxPolicy,
        model,
        effort,
        ...(model && {
          collaborationMode: {
            mode: this.policy.plan ? 'plan' : 'default',
            settings: { model, reasoning_effort: effort, developer_instructions: null },
          },
        }),
      })
      .catch((error: unknown) => {
        if (!this.dead)
          this.turns.failedToStart(error instanceof Error ? error.message : String(error))
      })
  }

  private notified(method: string, params: unknown) {
    if (this.dead) return

    const body = isRecord(params) ? params : {}

    if (method === 'item/started' && isRecord(body['item'])) {
      const item = body['item']

      if (typeof item['id'] === 'string' && typeof item['type'] === 'string') {
        this.items.set(item['id'], item as CodexItem)
      }
    }

    if (method === 'serverRequest/resolved') return this.withdrawn(body['requestId'])

    this.turns.notify(method, body)
  }

  /** Вопрос сервера - вопросом движку словами Claude; незнакомый - отказ сразу. */
  private asked(rpcId: RpcId, method: string, params: unknown) {
    const requestId = `codex-run-${String(rpcId)}`
    const held = holdServerRequest(
      rpcId,
      method,
      params,
      requestId,
      runModeOf(this.spec.permissionMode),
      (itemId) => {
        const item = this.items.get(itemId)
        const [tool] = item ? toolItemsOf(item, { parent: null, startedAt: 0, endedAt: 0 }) : []

        return tool
          ? { name: tool.name, input: tool.input, action: tool.action }
          : { name: 'apply_patch', input: {}, action: { kind: 'other', target: '', path: '' } }
      },
    )

    if (!held) {
      this.server?.respondError(rpcId, -32601, `Unsupported request: ${method}`)

      return
    }

    const question = engineQuestionOf(held.pending)

    this.questions.set(requestId, held)
    this.wires.onControlRequest(
      toolQuestion(requestId, question.toolName, question.input, question.description),
    )
  }

  private withdrawn(rpcId: unknown) {
    const requestId = `codex-run-${String(rpcId)}`

    if (this.questions.delete(requestId)) this.wires.onControlRequest(questionWithdrawn(requestId))
  }

  /** Не поднялся: движок слышит выход до первого слова - ошибку запуска со строкой причины. */
  private failed(error: unknown) {
    if (this.dead) return

    console.warn('[runs] сессия Codex не поднялась:', error)
    this.dead = true
    this.pending = []
    void this.server?.stop()
    this.connectors?.release()
    this.wires.onExit(null, error instanceof Error ? error.message : String(error))
  }
}
