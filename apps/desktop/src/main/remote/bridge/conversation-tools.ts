import type { Conversation, PermissionMode } from '@shared/claude'

import type { Command } from '@agentic-workstation/remote-protocol/commands'

import { withFiles } from './attached-files'
import type { BridgePorts } from './bridge-ports'
import type { Outcome } from './command-ledger'
import { asideAnswerWire, rewindOutcomeWire, rewindPreviewWire } from './conversation-extras-wire'
import type { Redact } from './fit'
import type { ModeGate } from './mode-gate'
import { done, fail } from './outcomes'

type ToolCommand = Extract<
  Command,
  {
    name:
      | 'conversation.enqueue'
      | 'conversation.unqueue'
      | 'conversation.moveQueued'
      | 'conversation.sendQueued'
      | 'conversation.dismiss'
      | 'conversation.forceStop'
      | 'conversation.stopTask'
      | 'conversation.cancelCarryOn'
      | 'conversation.setFast'
      | 'conversation.setMode'
      | 'conversation.aside'
      | 'conversation.asideCancel'
      | 'conversation.rewindPreview'
      | 'conversation.rewind'
  }
>

/**
 * Служебное поверх одного разговора с телефона (как в ACC): очередь сообщений, закрыть вопрос
 * без ответа, погасить процесс, остановить задачу, «Don't continue», быстрый режим, режим
 * разрешений, вопрос сбоку и откат. Те же публичные методы ClaudeService и панели, что у окна.
 * Разговор уже найден и его проект открыт - это проверил тот, кто зовёт.
 */
export class ConversationTools {
  constructor(
    private readonly ports: BridgePorts,
    private readonly redact: () => Redact,
    private readonly modes: ModeGate,
  ) {}

  async run(command: Command, conversation: Conversation): Promise<Outcome> {
    if (!isTool(command)) return fail('unknownCommand')

    const { conversations } = this.ports
    const { id } = conversation

    switch (command.name) {
      case 'conversation.enqueue': {
        const { images = [], files = [] } = command.args
        const text = await withFiles(command.args.text, files, conversations.saveFile)

        if (text === null) return fail('refused', 'fileNotSaved')

        await conversations.enqueue(id, { text, images })

        return done()
      }
      case 'conversation.unqueue':
        if (!isQueued(conversation, command.args.queuedId)) return fail('notFound')

        conversations.unqueue(id, command.args.queuedId)

        return done()
      case 'conversation.moveQueued':
        if (!isQueued(conversation, command.args.queuedId)) return fail('notFound')

        conversations.moveQueued(id, command.args.queuedId, command.args.toIndex)

        return done()
      case 'conversation.sendQueued':
        if (!isQueued(conversation, command.args.queuedId)) return fail('notFound')

        await conversations.sendQueued(id, command.args.queuedId)

        return done()
      case 'conversation.dismiss':
        return this.dismiss(conversation, command.args.requestId)
      case 'conversation.forceStop':
        conversations.forceStop(id)

        return done()
      case 'conversation.stopTask':
        conversations.stopTask(id, command.args.taskId)

        return done()
      case 'conversation.cancelCarryOn':
        conversations.cancelCarryOn(id)

        return done()
      case 'conversation.setFast':
        conversations.setOptions(id, { fastMode: command.args.fast })

        return done()
      case 'conversation.setMode':
        return this.setMode(conversation, command.args.mode)
      case 'conversation.aside':
        return this.aside(id, command.args.askId, command.args.question)
      case 'conversation.asideCancel':
        conversations.cancelAside(id, command.args.askId)

        return done()
      case 'conversation.rewindPreview': {
        const preview = await conversations.rewindPreview(id, command.args.messageId)

        return done(rewindPreviewWire(preview, this.redact()))
      }
      case 'conversation.rewind': {
        const { messageId, scope } = command.args
        const outcome = await conversations.rewind(id, messageId, scope)

        return done(rewindOutcomeWire(outcome, this.redact()))
      }
    }
  }

  /**
   * Закрыть вопрос с вариантами, не ответив, - как «Dismiss» у карточки панели: отказом
   * разрешения на этот вопрос. Вопроса уже нет - questionGone; у разрешения и плана свои кнопки
   * отказа (respond), закрывать там нечего.
   */
  private dismiss(conversation: Conversation, requestId: string): Outcome {
    const { pending } = conversation

    if (pending?.requestId !== requestId) return fail('questionGone')
    if (pending.kind !== 'question') return fail('badArgs')

    this.ports.conversations.respond(conversation.id, requestId, {
      kind: 'permission',
      decision: { behavior: 'deny', message: '' },
    })

    return done()
  }

  /**
   * Режим разрешений - как пункт меню MODE окна (ADR 0076): недоступный у окна (bypass под
   * запретом настроек, auto, от которого CLI отказался) - отказ modeUnavailable, текущий не
   * гасится. Отказ самого CLI потом вернёт вкладку к прежнему режиму, как у окна.
   */
  private async setMode(conversation: Conversation, mode: PermissionMode): Promise<Outcome> {
    const { conversations } = this.ports
    const allowed =
      mode === conversation.permissionMode ||
      (await this.modes.allows(mode, conversation.projectPath, conversation))

    if (!allowed) return fail('refused', 'modeUnavailable')
    // Пока читались настройки, вкладку могли закрыть.
    if (!conversations.getState().conversations.some((one) => one.id === conversation.id)) {
      return fail('notFound')
    }

    conversations.setOptions(conversation.id, { permissionMode: mode })

    return done()
  }

  /**
   * Вопрос сбоку: итог команды - ответ, когда он пришёл. Он уходит только спросившему телефону
   * (итогом его команды), в транскрипт не пишется. id уже занят - отказ askTaken.
   */
  private async aside(conversationId: string, askId: string, question: string): Promise<Outcome> {
    const exchange = await this.ports.conversations.askAside(conversationId, question, askId)

    if (!exchange) return fail('refused', 'askTaken')

    return done(asideAnswerWire(askId, exchange, this.redact()))
  }
}

const TOOL_COMMANDS: ReadonlySet<string> = new Set<ToolCommand['name']>([
  'conversation.enqueue',
  'conversation.unqueue',
  'conversation.moveQueued',
  'conversation.sendQueued',
  'conversation.dismiss',
  'conversation.forceStop',
  'conversation.stopTask',
  'conversation.cancelCarryOn',
  'conversation.setFast',
  'conversation.setMode',
  'conversation.aside',
  'conversation.asideCancel',
  'conversation.rewindPreview',
  'conversation.rewind',
])

const isTool = (command: Command): command is ToolCommand => TOOL_COMMANDS.has(command.name)

const isQueued = (conversation: Conversation, queuedId: string): boolean =>
  conversation.queue.some((queued) => queued.id === queuedId)
