import type { ModelInfo } from '@shared/conversation'

import { schemaNote } from '../run-stream/ask-once'
import type { EnginePrompt } from '../run-stream/claude-stream'
import {
  toolQuestion,
  engineAnswerOf,
  enginePromptOf,
  questionWithdrawn,
} from '../run-stream/claude-stream'
import { responseOf, engineQuestionOf } from '../run-stream/engine-questions'
import { RunJournal } from '../run-stream/run-journal'
import { runModeOf } from '../run-stream/run-modes'
import type { OpenCodeCli } from '../../opencode/cli/opencode-locator'
import type { OpenCodeLaunch } from '../../opencode/conversation/opencode-conversation'
import type { OpenCodeHistory } from '../../opencode/conversation/opencode-feed'
import type { OpenCodeHeld } from '../../opencode/conversation/opencode-requests'
import {
  holdForm,
  formAnswer,
  holdPermission,
  permissionReply,
} from '../../opencode/conversation/opencode-requests'
import { eventSessionOf } from '../../opencode/conversation/opencode-router'
import type { OpenCodeDirs, OpenCodeEvent } from '../../opencode/server/opencode-server'
import { OpenCodeServer } from '../../opencode/server/opencode-server'
import type {
  SessionSpec,
  SessionWires,
  SessionProcess,
} from '../../scenarios/engine/scenario-session'
import { OpenCodeTurnTranslator } from './opencode-run-events'
import { runRules, openRunSession } from './opencode-run-session'

/** Что переводчику OpenCode нужно от панели открытых моделей (opencode-service.ts). */
export type OpenCodeRunHost = {
  cli: () => Promise<OpenCodeCli | null>
  dirs: () => OpenCodeDirs
  /**
   * Конфиг процесса: подключения через прокси IDE, коннекторы проекта и свои серверы IDE.
   * directory - папка, где процесс работает (её правила - у компактных указаний, ADR 0089).
   * model - модель прогона (пусто - по умолчанию панели): модель Ollama к запуску готовится.
   * servers - только эти серверы коннекторов (пусто - ни одного); нет - все серверы проекта.
   */
  launch: (
    projectPath: string,
    directory: string,
    model: string | null,
    ideServers: readonly string[],
    servers?: readonly string[],
  ) => Promise<OpenCodeLaunch>
  /** Модели подключений: «по умолчанию» и уровни усилия у модели. */
  models: () => readonly ModelInfo[]
  /** Страница журнала сессии - журналу шага в окне. */
  messages: OpenCodeHistory['messages']
  /** Убрать бриф прогона из указаний сессии: её открыли чатом. */
  dropBrief: (sessionId: string) => Promise<void>
  /** Папка журналов сессий прогонов OpenCode (run-journal.ts). */
  journalDir: string
}

/** id сессии OpenCode по UUID движка: OpenCode берёт свой id (`ses...`), заданный IDE. */
export const openCodeSessionOf = (engineId: string): string => `ses_${engineId.replace(/-/g, '')}`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const textOf = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

/**
 * Процесс сессии прогона на OpenCode (docs/plan-providers/50-ide.md): `opencode serve` в папке
 * прогона с конфигом панели, сессия с id от UUID движка, наружу - поток Claude для движка.
 * Режим - правилами сессии (и её субагентов), бриф головы - указаниями сессии, команды агента -
 * в окружении человека. Сообщения до готовности копятся и уходят по порядку.
 */
export class OpenCodeRunProcess implements SessionProcess {
  private server: OpenCodeServer | null = null
  private launched: OpenCodeLaunch | null = null
  private journal: RunJournal | null = null
  private sessionId = ''
  private dead = false
  /** Бриф не встал указаниями сессии - едет первым сообщением. */
  private briefingInPrompt = false
  private pending: EnginePrompt[] = []
  private readonly children = new Set<string>()
  private readonly questions = new Map<string, OpenCodeHeld>()
  private readonly turns: OpenCodeTurnTranslator

  constructor(
    private readonly host: OpenCodeRunHost,
    private readonly spec: SessionSpec,
    private readonly place: { cwd: string; projectPath: string },
    private readonly wires: SessionWires,
  ) {
    this.turns = new OpenCodeTurnTranslator(
      spec.sessionId,
      {
        emit: (message) => {
          if (!this.dead) wires.onMessage(message)
          if (message.type === 'result') this.launched?.connectors?.idle()
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
    if (this.sessionId) this.prompt(prompt)
    else this.pending.push(prompt)
  }

  /** Stop хода - и сессии, и субагентов, что работают на неё в фоне. */
  async control(request: Record<string, unknown>): Promise<unknown> {
    const server = this.server

    if (request['subtype'] !== 'interrupt' || !server || !this.sessionId) return null

    return Promise.all(
      [this.sessionId, ...this.children].map((id) =>
        server.request('POST', `/api/session/${id}/interrupt`).catch(() => undefined),
      ),
    )
  }

  respond(requestId: string, response: Record<string, unknown>): void {
    const held = this.questions.get(requestId)
    const server = this.server

    if (!held || !server) return

    this.questions.delete(requestId)

    const answer = engineAnswerOf(response)
    const reply = responseOf(held.pending, answer)
    const base = `/api/session/${held.sessionId || this.sessionId}`
    const call =
      held.source === 'form'
        ? answer.allow
          ? server.request('POST', `${base}/form/${held.openCodeId}/reply`, {
              body: { answer: formAnswer(held, reply) },
            })
          : server.request('DELETE', `${base}/form/${held.openCodeId}`)
        : server.request('POST', `${base}/permission/${held.openCodeId}/reply`, {
            body: { decision: permissionReply(reply) },
          })

    void call.catch((error: unknown) => console.warn('[runs] OpenCode не принял ответ:', error))
  }

  async stop(): Promise<void> {
    this.dead = true
    this.pending = []
    await this.server?.stop()
    this.release()
  }

  private async boot(): Promise<void> {
    const { host, spec, place } = this
    const cli = await host.cli()

    if (!cli) return this.failed(new Error('OpenCode is not installed or not found.'))

    const launched = await host.launch(
      place.projectPath,
      place.cwd,
      spec.model,
      spec.ideServers ?? [],
    )

    this.launched = launched
    // Сессия - свой разговор у коннекторов: вкладки браузера и файлы - из её папки.
    launched.connectors?.own({ conversationId: spec.sessionId, workDir: place.cwd })

    if (this.dead) return this.release()

    const server = new OpenCodeServer(
      {
        binary: cli.binary,
        cwd: place.cwd,
        env: { ...cli.env, ...launched.env },
        dirs: host.dirs(),
        config: launched.config,
      },
      {
        onEvent: (event) => this.heard(event),
        onExit: (code, stderrTail) => {
          this.release()
          if (!this.dead) this.wires.onExit(code, stderrTail)
          this.dead = true
        },
      },
    )

    this.server = server
    this.journal = await RunJournal.open(host.journalDir, spec.sessionId)

    const sessionId = this.journal.native ?? openCodeSessionOf(spec.sessionId)

    this.briefingInPrompt = await openRunSession(server, sessionId, {
      spec: this.spec,
      cwd: place.cwd,
      models: host.models(),
      permissions: this.rules(),
    })
    // Команды агента - в окружении человека, а не процесса OpenCode (там его конфиг и пароль).
    await server.request('PUT', `/api/session/${sessionId}/environment`, {
      body: { variables: cli.env },
    })

    if (this.dead) return

    await this.journal.begin(sessionId, place.cwd)
    this.sessionId = sessionId

    for (const prompt of this.pending.splice(0)) this.prompt(prompt)
  }

  /** Правила режима (и веб разговору о коннекторе) - сессии и её субагентам. */
  private rules() {
    return runRules(this.spec, this.launched?.allowedActions ?? [])
  }

  /** Сообщение движка: новый ход или доставка в идущий. */
  private prompt(prompt: EnginePrompt) {
    const server = this.server

    if (!server) return

    const briefing = this.briefingInPrompt ? this.spec.briefing : ''

    this.briefingInPrompt = false
    this.journal?.note('prompt', prompt.text)

    const steering = this.turns.isOpen
    const { outputSchema } = this.spec
    // Схемы ответа у OpenCode нет - она словами в каждом сообщении, JSON - из ответа.
    const schema = outputSchema ? schemaNote(outputSchema) : ''
    const body = {
      text: [briefing, prompt.text, schema].filter(Boolean).join('\n\n'),
      files: prompt.images.map((image, index) => ({
        uri: `data:${image.mediaType};base64,${image.data}`,
        name: `image-${index + 1}.${image.mediaType.split('/')[1] ?? 'png'}`,
      })),
      delivery: steering ? 'steer' : 'queue',
    }

    void server
      .request('POST', `/api/session/${this.sessionId}/prompt`, { body })
      .catch((error: unknown) => {
        if (this.dead || steering) return

        this.turns.failedToStart(error instanceof Error ? error.message : String(error))
      })
  }

  private heard(event: OpenCodeEvent) {
    if (this.dead || !this.sessionId) return

    const { data, type } = event
    const sessionId = eventSessionOf(data)
    const parentId = typeof data['parentID'] === 'string' ? data['parentID'] : ''
    const ours = sessionId === this.sessionId
    const child = this.children.has(sessionId)

    if (
      type === 'session.created' &&
      (parentId === this.sessionId || this.children.has(parentId))
    ) {
      return this.adopt(sessionId)
    }

    if (!ours && !child) return
    if (type === 'permission.asked' || type === 'form.created') return this.asked(type, data)
    if (type === 'permission.replied') return this.withdrawn(textOf(data, 'requestID'))
    if (type === 'form.replied' || type === 'form.cancelled') {
      return this.withdrawn(textOf(data, 'formID') || textOf(data, 'id'))
    }

    if (ours) return this.turns.own(event)

    if (type === 'session.execution.started') this.turns.helper(sessionId, true)
    else if (type.startsWith('session.execution.')) this.turns.helper(sessionId, false)
  }

  /** Субагент сессии: правила режима и ему; его вопросы - вопросы прогона. */
  private adopt(childId: string) {
    this.children.add(childId)
    void this.server
      ?.request('PATCH', `/api/session/${childId}`, { body: { permissions: this.rules() } })
      .catch(() => undefined)
  }

  /** Вопрос OpenCode - вопросом движку словами Claude. */
  private asked(type: string, data: Record<string, unknown>) {
    const form = isRecord(data['form']) ? data['form'] : data
    const source = type === 'form.created' ? form : data
    const openCodeId = typeof source['id'] === 'string' ? source['id'] : ''
    const requestId = `opencode-run-${openCodeId}`
    const held =
      type === 'form.created'
        ? holdForm(requestId, form)
        : holdPermission(
            requestId,
            data,
            null,
            runModeOf(this.spec.permissionMode),
            this.place.cwd,
            this.launched?.servers,
          )
    const question = engineQuestionOf(held.pending)

    this.questions.set(requestId, held)
    this.wires.onControlRequest(
      toolQuestion(requestId, question.toolName, question.input, question.description),
    )
  }

  private withdrawn(openCodeId: string) {
    const requestId = `opencode-run-${openCodeId}`

    if (this.questions.delete(requestId)) this.wires.onControlRequest(questionWithdrawn(requestId))
  }

  private release() {
    this.launched?.connectors?.release()
    this.launched?.release()
  }

  /** Не поднялся: движок слышит выход до первого слова - ошибку запуска с причиной. */
  private failed(error: unknown) {
    if (this.dead) return

    console.warn('[runs] сессия OpenCode не поднялась:', error)
    this.dead = true
    this.pending = []
    void this.server?.stop()
    this.release()
    this.wires.onExit(null, error instanceof Error ? error.message : String(error))
  }
}
