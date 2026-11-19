import type { PermissionMode } from '@shared/conversation'
import { effortLevelOf } from '@shared/conversation'

import { schemaNote } from '../run-stream/ask-once'
import type { EnginePrompt } from '../run-stream/claude-stream'
import { enginePromptOf } from '../run-stream/claude-stream'
import { RunJournal } from '../run-stream/run-journal'
import { runModeOf } from '../run-stream/run-modes'
import { AcpProcess, isAuthError, unsupported } from '../../acp/client/acp-process'
import { ACP_PROMPT_TIMEOUT_MS, ACP_CLIENT_CAPABILITIES } from '../../acp/client/acp.constants'
import type { AcpConnectors } from '../../acp/conversation/acp-conversation'
import type { AcpChoice, AcpSettingsTarget } from '../../acp/conversation/acp-options'
import { optionOf, applyChoice } from '../../acp/conversation/acp-options'
import type {
  AcpToolCall,
  AcpContentBlock,
  AcpPromptResult,
  AcpSessionSetup,
  AcpSessionUpdate,
} from '../../acp/protocol/acp-types'
import type {
  SessionSpec,
  SessionWires,
  SessionProcess,
} from '../../scenarios/engine/scenario-session'
import { inputLine, AcpRunCalls } from './acp-run-calls'
import type { AcpRunHost } from './acp-run-host'
import { failureOf } from './acp-run-host'
import { AcpRunQuestions } from './acp-run-questions'
import type { AcpRunRules } from './acp-run-rules'
import { servedMode } from './acp-run-rules'
import { holdRunSession, openRunSession, releaseRunSession } from './acp-run-session'
import { AcpTurnTranslator } from './acp-run-turns'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Процесс сессии прогона на агенте ACP (ADR 0085, 0092): агент в папке прогона со своей папкой
 * IDE и коннекторами шлюза, его сессия - разговор прогона, наружу - поток Claude для движка.
 * id сессии движка - UUID, разговор у агента - первой строкой журнала сессии. Бриф головы -
 * указаниями сессии, если агент их принимает, иначе (Kimi) первым блоком первого сообщения.
 * Модель, усилие и режим ставятся перед каждым ходом: из плана агент выходит молча. Сообщения
 * до готовности и посреди хода копятся и уходят следующими ходами: слова в идущий ход ACP не
 * доставляет.
 */
export class AcpRunProcess implements SessionProcess {
  private process: AcpProcess | null = null
  private connectors: AcpConnectors | null = null
  private journal: RunJournal | null = null
  private sessionId = ''
  private setup: AcpSessionSetup = {}
  private dead = false
  private briefInPrompt = false
  /** Stop этого хода уже был: ход, не дошедший до агента, кончается отменой. */
  private interrupted = false
  /** Разговор у агента держит этот процесс: журнал шага читает журнал прогона. */
  private holding = false
  private pending: EnginePrompt[] = []
  private readonly calls: AcpRunCalls
  private readonly questions: AcpRunQuestions
  private readonly turns: AcpTurnTranslator
  /** Режим, которым прогон ведёт агент: «только чтение» без такого режима у агента - планом. */
  private readonly served: PermissionMode
  private rules: AcpRunRules

  constructor(
    private readonly host: AcpRunHost,
    private readonly spec: SessionSpec,
    private readonly place: { cwd: string; projectPath: string },
    private readonly wires: SessionWires,
  ) {
    const { agent } = host
    const mode = runModeOf(spec.permissionMode)

    this.served = servedMode(agent, mode)
    this.rules = { allowed: [], web: spec.web === true, readOnly: mode === 'readOnly' }
    this.calls = new AcpRunCalls(
      (call, base) => agent.lens(this.connectors?.servers.map((one) => one.name) ?? [])(call, base),
      agent.toolId,
    )
    this.questions = new AcpRunQuestions({
      agent,
      calls: this.calls,
      mode,
      rules: () => this.rules,
      seen: (call) => this.seen(call),
      ask: (request) => {
        if (!this.dead) wires.onControlRequest(request)
      },
      // Из одобренного плана агент выходит молча: режим поставится заново перед ходом.
      planAnswered: () => this.noteMode(''),
    })
    this.turns = new AcpTurnTranslator(
      spec.sessionId,
      {
        emit: (message) => {
          if (!this.dead) wires.onMessage(message)
          if (message.type === 'result') this.connectors?.launch?.idle()
        },
        note: (who, said) => this.journal?.note(who, said),
      },
      spec.outputSchema !== undefined,
    )
    void this.boot().catch((error: unknown) => this.failed(error))
  }

  get isAlive(): boolean {
    return !this.dead && (this.process?.isAlive ?? true)
  }

  write(message: object): void {
    const prompt = enginePromptOf(message)

    if (this.dead || !prompt) return

    this.pending.push(prompt)
    this.next()
  }

  /** Stop хода: `session/cancel`, вопросы хода сняты; ход кончится ответом агента `cancelled`. */
  control(request: Record<string, unknown>): Promise<unknown> {
    const process = this.process

    if (request['subtype'] !== 'interrupt' || !process || !this.turns.isOpen) {
      return Promise.resolve(null)
    }

    this.pending = []
    this.interrupted = true
    this.questions.withdrawAll(true)
    process.notify('session/cancel', { sessionId: this.sessionId })

    return Promise.resolve(null)
  }

  respond(requestId: string, response: Record<string, unknown>): void {
    this.questions.respond(requestId, response)
  }

  async stop(): Promise<void> {
    this.dead = true
    this.pending = []
    await this.process?.stop()
    this.release()
  }

  private async boot(): Promise<void> {
    const { host, spec, place } = this
    const cli = await host.cli()

    if (!cli) return this.failed(new Error(`${host.label} is not installed or not found.`))
    if (this.dead) return

    const connectors = host.connectors(place.projectPath, spec.ideServers ?? [])

    // Сессия - свой разговор у коннекторов: вкладки браузера и файлы - из её папки.
    connectors.launch?.own({ conversationId: spec.sessionId, workDir: place.cwd })
    this.connectors = connectors
    // Свои серверы IDE (уведомления, чтение IDE) - без вопроса, как у вкладки панели.
    this.rules = {
      ...this.rules,
      allowed: [...(connectors.launch?.allowed ?? []), ...(spec.allowedTools ?? [])],
    }

    const launch = host.agent.launch(this.served)
    const process = new AcpProcess(
      {
        binary: cli.binary,
        args: launch.args,
        cwd: place.cwd,
        env: { ...cli.env, ...launch.env },
        capabilities: ACP_CLIENT_CAPABILITIES,
        version: host.version,
      },
      {
        onNotification: (method, params) => this.notified(method, params),
        onRequest: (method, params) =>
          this.dead ? unsupported(method) : this.questions.requested(method, params),
        onExit: (code, stderrTail) => {
          this.release()
          if (!this.dead) this.wires.onExit(code, stderrTail)
          this.dead = true
        },
      },
    )

    this.process = process
    this.journal = await RunJournal.open(host.journalDir, spec.sessionId)

    const brief = spec.briefing ? host.agent.instructions?.(spec.briefing) : undefined
    const opened = await openRunSession(process, {
      known: this.journal.native,
      cwd: place.cwd,
      servers: connectors.servers,
      extra: brief ?? {},
    })

    if (this.dead) return

    await this.journal.begin(opened.sessionId, place.cwd)
    this.setup = opened.setup
    this.briefInPrompt = opened.fresh && !brief && spec.briefing !== ''
    this.sessionId = opened.sessionId
    this.holding = true
    holdRunSession(opened.sessionId)
    this.next()
  }

  /** Следующее сообщение - новым ходом, если ход не идёт и сессия готова. */
  private next(): void {
    if (this.dead || !this.sessionId || this.turns.isOpen) return

    const prompt = this.pending.shift()

    if (prompt) void this.turn(prompt)
  }

  private async turn(prompt: EnginePrompt): Promise<void> {
    const process = this.process

    if (!process) return

    const briefing = this.briefInPrompt ? this.spec.briefing : ''

    this.briefInPrompt = false
    this.interrupted = false
    this.journal?.note('prompt', prompt.text)
    this.turns.started()

    try {
      await applyChoice(this.target(process), this.host.agent, this.choice())

      // Stop пришёл, пока ставились настройки: отменять у агента было ещё нечего.
      this.finishTurn(
        this.interrupted
          ? { stopReason: 'cancelled' }
          : ((await process.request(
              'session/prompt',
              { sessionId: this.sessionId, prompt: this.blocksOf(briefing, prompt) },
              ACP_PROMPT_TIMEOUT_MS,
            )) as AcpPromptResult),
      )
    } catch (error) {
      // Процесс ушёл посреди хода: движок слышит выход, итога не будет.
      if (this.dead) return

      this.settle()
      if (isAuthError(error)) this.host.signedOut()
      this.turns.failed(failureOf(this.host, error))
    }

    this.next()
  }

  /** Ответ агента на ход: вопросы без ответа сняты, итог - движку. */
  private finishTurn(result: AcpPromptResult): void {
    if (this.dead) return

    this.settle()
    this.turns.ended(result)
  }

  /** Модель, усилие и режим прогона; модели, которой агент не знает, - модель агента. */
  private choice(): AcpChoice {
    return {
      model: this.spec.model || null,
      effort: effortLevelOf(this.spec.effort),
      mode: this.host.agent.modeOf(this.served),
    }
  }

  private target(process: AcpProcess): AcpSettingsTarget {
    return {
      request: (method, params) => process.request(method, params),
      sessionId: this.sessionId,
      setup: this.setup,
      noteSetup: (setup) => void Object.assign(this.setup, setup),
    }
  }

  /** Бриф - первым блоком, схема ответа - словами в каждом сообщении, картинки - блоками. */
  private blocksOf(briefing: string, prompt: EnginePrompt): AcpContentBlock[] {
    const { outputSchema } = this.spec
    const text = [prompt.text, outputSchema ? schemaNote(outputSchema) : '']
      .filter(Boolean)
      .join('\n\n')

    return [
      ...[briefing, text]
        .filter(Boolean)
        .map((one): AcpContentBlock => ({ type: 'text', text: one })),
      ...prompt.images.map((image): AcpContentBlock => ({
        type: 'image',
        data: image.data,
        mimeType: image.mediaType,
      })),
    ]
  }

  private notified(method: string, params: unknown): void {
    if (this.dead || method !== 'session/update' || !isRecord(params)) return
    if (!this.sessionId || params['sessionId'] !== this.sessionId) return

    const update = params['update'] as AcpSessionUpdate

    if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
      this.seen(update)
    } else if (update.sessionUpdate === 'config_option_update') {
      this.setup.configOptions = update.configOptions
    } else if (update.sessionUpdate === 'current_mode_update') {
      this.noteMode(update.currentModeId)
    }

    this.turns.update(update)
  }

  /** Вызов из обновления или вопроса; первое о нём - строкой журнала. */
  private seen(call: AcpToolCall): void {
    const view = this.calls.update(call)

    if (view) this.journal?.note('tool', `${view.name} ${inputLine(view.input)}`)
  }

  /** Ход кончился: вопросы без ответа сняты, вызовы хода забыты. */
  private settle(): void {
    this.questions.withdrawAll(!this.dead)
    this.calls.clear()
  }

  /** Режим агента сейчас; пусто - неизвестен (вышел из плана молча), перед ходом - заново. */
  private noteMode(modeId: string): void {
    const option = optionOf(this.setup.configOptions, 'mode')

    if (option) option.currentValue = modeId
    if (this.setup.modes) this.setup.modes.currentModeId = modeId
  }

  /** Ключ шлюза и разговор отпущены; зовут и выход процесса, и stop - разговор отпускается раз. */
  private release(): void {
    if (this.holding) releaseRunSession(this.sessionId)
    this.holding = false
    this.connectors?.launch?.release()
  }

  /** Не поднялся: движок слышит выход до первого слова - причину одной строкой. */
  private failed(error: unknown): void {
    if (this.dead) return

    console.warn(`[runs] сессия ${this.host.agent.tag} не поднялась:`, error)
    if (isAuthError(error)) this.host.signedOut()
    this.dead = true
    this.pending = []
    void this.process?.stop()
    this.release()
    this.wires.onExit(null, failureOf(this.host, error))
  }
}
