import type { Conversation, RequestResponse } from '@shared/claude'
import { isProviderId } from '@shared/providers'

import type { Command, CommandArgs } from '@agentic-workstation/remote-protocol/commands'
import { PHONE_PERMISSION_MODES } from '@agentic-workstation/remote-protocol/commands'

import type { BridgePorts } from './bridge-ports'
import type { Outcome } from './command-ledger'
import { ConversationReads } from './conversation-reads'
import { ConversationTools } from './conversation-tools'
import type { Redact } from './fit'
import { done, fail } from './outcomes'
import type { ProjectKeys } from './project-keys'

const PHONE_MODES: readonly string[] = PHONE_PERMISSION_MODES

export type ConversationCommand = Extract<Command, { name: `conversation.${string}` }>

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
 * Команды разговоров - публичными методами ClaudeService, теми же, что зовёт окно. Разговор -
 * только в открытом проекте; проект - по ключу из тех, что IDE назвала сама. Чтение по просьбе
 * (история, страница выше, картинка, поиск) - ConversationReads; служебное поверх разговора
 * (очередь, остановки, вопрос сбоку, откат) - ConversationTools.
 */
export class ConversationCommands {
  private readonly reads: ConversationReads
  private readonly tools: ConversationTools

  constructor(
    private readonly ports: BridgePorts,
    private readonly keys: () => ProjectKeys,
    redact: () => Redact,
  ) {
    this.reads = new ConversationReads(ports, keys, redact)
    this.tools = new ConversationTools(ports, redact)
  }

  async run(command: ConversationCommand): Promise<Outcome> {
    switch (command.name) {
      case 'conversation.new':
        return this.newConversation(command.args)
      case 'conversation.history':
        return this.reads.history(command.args)
      case 'conversation.openHistory':
        return this.reads.openHistory(command.args)
      case 'conversation.search':
        return this.reads.search(command.args)
      case 'conversation.searchAi':
        return this.reads.searchAi(command.args)
      case 'conversation.searchCancel':
        return this.reads.searchCancel(command.args)
      default:
        return this.inConversation(command)
    }
  }

  /** Команды одному разговору: он есть и его проект открыт - иначе отказ. */
  private async inConversation(command: ConversationCommand): Promise<Outcome> {
    const { conversations } = this.ports
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
      case 'conversation.respond':
        return this.respond(conversation, command.args)
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
        return this.tools.run(command, conversation)
    }
  }

  /**
   * Ответ на вопрос, которого уже нет (ответили за столом, вопрос снят, стоит следующий), -
   * отказ, а не «ок»: иначе телефон считал бы, что ответил он, а ответ никуда не лёг.
   */
  private respond(conversation: Conversation, args: CommandArgs<'conversation.respond'>): Outcome {
    const { requestId, decision } = args
    const { pending } = conversation

    if (pending?.requestId !== requestId) return fail('questionGone')
    // Ответ не того вида на тот же вопрос - не ответ.
    if (pending.kind !== decision.kind) return fail('badArgs')

    this.ports.conversations.respond(conversation.id, requestId, responseOf(decision))

    return done()
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
}
