import type { RequestResponse } from '@shared/claude'
import { isProviderId } from '@shared/providers'
import type { ScenarioCode } from '@shared/scenarios'

import type { RemoteErrorCode } from '@agentic-workstation/remote-protocol/agent-messages'
import type { Command, CommandArgs } from '@agentic-workstation/remote-protocol/commands'
import { PHONE_PERMISSION_MODES } from '@agentic-workstation/remote-protocol/commands'

import type { BridgePorts } from './bridge-ports'
import type { Outcome } from './command-ledger'
import { ConversationReads } from './conversation-reads'
import type { Redact } from './fit'
import type { ProjectKeys } from './project-keys'
import { runProjectPath, shelfScenarioWire } from './scenario-wire'

const PHONE_MODES: readonly string[] = PHONE_PERMISSION_MODES

const done = (data?: unknown): Outcome => (data === undefined ? { ok: true } : { ok: true, data })

const fail = (code: RemoteErrorCode, detail?: string): Outcome =>
  detail === undefined ? { ok: false, code } : { ok: false, code, detail }

/** Отказ сценариев - их кодом (queueBusy, untrusted, runOver…): у телефона есть на него слова. */
const scenarioOutcome = (code: ScenarioCode | null): Outcome =>
  code ? fail('refused', code) : done()

type Decision = CommandArgs<'conversation.respond'>['decision']

/** Ответ телефона - словом IDE. «Разрешать всегда» не выражается вовсе; план - без смены режима. */
const responseOf = (decision: Decision): RequestResponse => {
  switch (decision.kind) {
    case 'permission':
      return {
        kind: 'permission',
        decision: decision.allow
          ? { behavior: 'allow' }
          : { behavior: 'deny', message: decision.message ?? '' },
      }
    case 'question':
      return { kind: 'question', answers: decision.answers }
    case 'plan':
      return {
        kind: 'plan',
        approved: decision.approve,
        acceptEdits: false,
        feedback: decision.feedback ?? '',
      }
  }
}

/**
 * Команды телефона - публичными методами сервисов IDE, теми же, что зовёт окно. Проект - по
 * ключу из тех, что IDE назвала сама; разговор - только в открытом проекте; прогон и очередь -
 * по id, их проект находит IDE.
 */
export class CommandDesk {
  private readonly reads: ConversationReads

  constructor(
    private readonly ports: BridgePorts,
    private readonly keys: () => ProjectKeys,
    redact: () => Redact,
  ) {
    this.reads = new ConversationReads(ports, keys, redact)
  }

  run(command: Command): Promise<Outcome> {
    return command.name.startsWith('conversation.')
      ? this.conversation(command)
      : this.scenario(command)
  }

  private async conversation(command: Command): Promise<Outcome> {
    const { conversations } = this.ports

    if (command.name === 'conversation.new') return this.newConversation(command.args)
    if (command.name === 'conversation.history') return this.reads.history(command.args)
    if (command.name === 'conversation.openHistory') return this.reads.openHistory(command.args)

    const id = 'conversationId' in command.args ? command.args.conversationId : ''
    const conversation = conversations.getState().conversations.find((one) => one.id === id)

    if (!conversation) return fail('notFound')
    if (!this.keys().isOpen(conversation.projectPath)) return fail('notOpen')

    switch (command.name) {
      case 'conversation.send': {
        const { text, images = [] } = command.args

        await conversations.send(id, { text, images })

        return done()
      }
      case 'conversation.respond': {
        const { requestId, decision } = command.args
        const pending = conversation.pending

        // Ответ на вопрос, которого уже нет (ответили за столом, вопрос снят, стоит следующий), -
        // отказ, а не «ок»: иначе телефон считал бы, что ответил он, а ответ никуда не лёг.
        if (pending?.requestId !== requestId) return fail('questionGone')
        // Ответ не того вида на тот же вопрос - не ответ.
        if (pending.kind !== decision.kind) return fail('badArgs')

        conversations.respond(id, requestId, responseOf(decision))

        return done()
      }
      case 'conversation.interrupt':
        conversations.interrupt(id)

        return done()
      case 'conversation.rename':
        await conversations.rename(id, command.args.title)

        return done()
      case 'conversation.setModel':
        conversations.setOptions(id, { model: command.args.model })

        return done()
      case 'conversation.setEffort':
        conversations.setOptions(id, { effort: command.args.effort })

        return done()
      case 'conversation.earlier':
        return this.reads.earlier(command.args)
      case 'conversation.image':
        return this.reads.image(command.args)
      default:
        return fail('unknownCommand')
    }
  }

  /**
   * Новый разговор с телефона. Режим задаётся всегда (default, если телефон не выбрал): иначе
   * вкладка взяла бы закреплённый в настройках или режим выбранной вкладки - auto или bypass,
   * которые с телефона не выбираются. Вышел режим не из телефонных - разговор закрывается, а
   * телефону отказ.
   */
  private async newConversation(args: CommandArgs<'conversation.new'>): Promise<Outcome> {
    const path = this.keys().openPathOf(args.projectKey)

    if (!path) return fail(this.keys().pathOf(args.projectKey) ? 'notOpen' : 'notFound')
    if (!isProviderId(args.provider)) return fail('refused', 'providerMissing')

    const { conversations } = this.ports
    const id = await conversations.newConversation(path, {
      ...(args.model !== undefined && { model: args.model }),
      ...(args.effort !== undefined && { effort: args.effort }),
      permissionMode: args.permissionMode ?? 'default',
    })
    const created = conversations.getState().conversations.find((one) => one.id === id)

    if (!created) return fail('failed')

    if (!PHONE_MODES.includes(created.permissionMode)) {
      console.warn(`[remote] новый разговор вышел в режиме ${created.permissionMode} - закрыт`)
      await conversations.close(id)

      return fail('refused', 'permissionMode')
    }

    return done({ conversationId: id })
  }

  private async scenario(command: Command): Promise<Outcome> {
    const { scenarios } = this.ports
    const view = scenarios.queuesView()

    switch (command.name) {
      case 'scenarios.shelves': {
        const path = this.keys().openPathOf(command.args.projectKey)

        if (!path) return fail('notOpen')

        return done({ scenarios: (await scenarios.shelves(path)).scenarios.map(shelfScenarioWire) })
      }
      case 'scenarios.start': {
        const { projectKey, provider, ...rest } = command.args
        const path = this.keys().openPathOf(projectKey)

        if (!path) return fail('notOpen')
        if (!isProviderId(provider)) return fail('refused', 'providerMissing')

        const started = await scenarios.start({ ...rest, projectPath: path, provider })

        return started.ok
          ? done({ queueId: started.queueId, itemId: started.itemId })
          : fail('refused', started.code)
      }
      case 'scenarios.queue':
        if (!view.queues.some((queue) => queue.id === command.args.queueId)) return fail('notFound')

        return scenarioOutcome(await scenarios.act(command.args.queueId, command.args.action))
      case 'scenarios.carryOn':
        return scenarioOutcome(await scenarios.carryOn(command.args.runId))
      default:
        return this.runCommand(command, view)
    }
  }

  /** Команды идущему прогону: проект находит IDE по очереди прогона. */
  private runCommand(
    command: Command,
    view: ReturnType<BridgePorts['scenarios']['queuesView']>,
  ): Outcome {
    const { scenarios } = this.ports
    const runId = 'runId' in command.args ? command.args.runId : ''
    const path = runProjectPath(view, runId)

    if (!path) return fail('notFound')

    switch (command.name) {
      case 'scenarios.control': {
        const refusal = scenarios.control(path, runId, command.args.action, command.args.seen)

        return refusal ? fail(refusal === 'runMoved' ? 'runMoved' : 'refused', refusal) : done()
      }
      case 'scenarios.answer': {
        const { allow, text, question } = command.args

        return scenarios.answer(path, runId, allow, text, question) ? done() : fail('questionGone')
      }
      case 'scenarios.tell':
        return scenarios.tell(path, runId, command.args.text, command.args.images ?? [])
          ? done()
          : fail('refused', 'runOver')
      default:
        return fail('unknownCommand')
    }
  }
}
