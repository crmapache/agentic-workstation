import type { Conversation, PermissionMode } from '@shared/conversation'
import type { RewindScope } from '@shared/rewind'

import type { Command } from '@agentic-workstation/remote-protocol/commands'

import { withFiles } from './attached-files'
import type { BridgePorts } from './bridge-ports'
import type { Outcome } from './command-ledger'
import { asideAnswerWire, rewindOutcomeWire, rewindPreviewWire } from './conversation-extras-wire'
import type { Redact } from './fit'
import type { ModeGate } from './mode-gate'
import { done, fail } from './outcomes'
import type { Owner } from './panels'
import { supports } from './panels'

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

/** Чего провайдер не умеет (у окна этой кнопки нет), - отказ телефону этим словом. */
const UNSUPPORTED = 'notSupported'

/**
 * Служебное поверх одного разговора с телефона (как в ACC): очередь сообщений, закрыть вопрос
 * без ответа, погасить процесс, остановить задачу, «Don't continue», быстрый режим, режим
 * разрешений, вопрос сбоку и откат. Те же публичные методы панели провайдера, что у окна; чего
 * провайдер не умеет (capabilities), у окна нет - и с телефона отказ notSupported. Разговор уже
 * найден у своей панели и его проект открыт - это проверил тот, кто зовёт.
 */
export class ConversationTools {
  constructor(
    private readonly ports: BridgePorts,
    private readonly redact: () => Redact,
    private readonly modes: ModeGate,
  ) {}

  async run(command: Command, owner: Owner): Promise<Outcome> {
    if (!isTool(command)) return fail('unknownCommand')

    const { panel, conversation } = owner
    const { id } = conversation

    switch (command.name) {
      case 'conversation.enqueue': {
        const { images = [], files = [] } = command.args
        const text = await withFiles(command.args.text, files, this.ports.panels.saveFile)

        if (text === null) return fail('refused', 'fileNotSaved')

        await panel.enqueue(id, { text, images })

        return done()
      }
      case 'conversation.unqueue':
        if (!isQueued(conversation, command.args.queuedId)) return fail('notFound')

        panel.unqueue(id, command.args.queuedId)

        return done()
      case 'conversation.moveQueued':
        if (!isQueued(conversation, command.args.queuedId)) return fail('notFound')

        panel.moveQueued(id, command.args.queuedId, command.args.toIndex)

        return done()
      case 'conversation.sendQueued':
        if (!isQueued(conversation, command.args.queuedId)) return fail('notFound')

        await panel.sendQueued(id, command.args.queuedId)

        return done()
      case 'conversation.dismiss':
        return this.dismiss(owner, command.args.requestId)
      case 'conversation.forceStop':
        panel.forceStop(id)

        return done()
      case 'conversation.stopTask':
        if (!supports(panel, 'stopTask')) return fail('refused', UNSUPPORTED)

        panel.stopTask(id, command.args.taskId)

        return done()
      case 'conversation.cancelCarryOn':
        if (!supports(panel, 'carryOn') || !panel.cancelCarryOn) {
          return fail('refused', UNSUPPORTED)
        }

        panel.cancelCarryOn(id)

        return done()
      case 'conversation.setFast':
        if (!supports(panel, 'fastMode')) return fail('refused', UNSUPPORTED)

        panel.setOptions(id, { fastMode: command.args.fast })

        return done()
      case 'conversation.setMode':
        return this.setMode(owner, command.args.mode)
      case 'conversation.aside':
        return this.aside(owner, command.args.askId, command.args.question)
      case 'conversation.asideCancel':
        if (!supports(panel, 'sideQuestion') || !panel.cancelAside) {
          return fail('refused', UNSUPPORTED)
        }

        panel.cancelAside(id, command.args.askId)

        return done()
      case 'conversation.rewindPreview': {
        if (!supports(panel, 'rewind')) return fail('refused', UNSUPPORTED)

        const preview = await panel.rewindPreview(id, command.args.messageId)

        return done(rewindPreviewWire(preview, this.redact()))
      }
      case 'conversation.rewind': {
        const { messageId, scope } = command.args

        if (!rewinds(owner, scope)) return fail('refused', UNSUPPORTED)

        const outcome = await panel.rewind(id, messageId, scope)

        return done(rewindOutcomeWire(outcome, this.redact()))
      }
    }
  }

  /**
   * Закрыть вопрос с вариантами, не ответив, - как «Dismiss» у карточки панели: отказом
   * разрешения на этот вопрос. Вопроса уже нет - questionGone; у разрешения и плана свои кнопки
   * отказа (respond), закрывать там нечего.
   */
  private dismiss({ panel, conversation }: Owner, requestId: string): Outcome {
    const { pending } = conversation

    if (pending?.requestId !== requestId) return fail('questionGone')
    if (pending.kind !== 'question') return fail('badArgs')

    panel.respond(conversation.id, requestId, {
      kind: 'permission',
      decision: { behavior: 'deny', message: '' },
    })

    return done()
  }

  /**
   * Режим разрешений - как пункт меню MODE окна (ADR 0076): недоступный у окна (не этого
   * провайдера, bypass под запретом настроек, auto, от которого CLI отказался) - отказ
   * modeUnavailable, текущий не гасится. Отказ самого CLI потом вернёт вкладку к прежнему
   * режиму, как у окна.
   */
  private async setMode({ panel, conversation }: Owner, mode: PermissionMode): Promise<Outcome> {
    const allowed =
      mode === conversation.permissionMode ||
      (await this.modes.allows(panel.provider, mode, conversation.projectPath, conversation))

    if (!allowed) return fail('refused', 'modeUnavailable')
    // Пока читались настройки, вкладку могли закрыть.
    if (!panel.getState().conversations.some((one) => one.id === conversation.id)) {
      return fail('notFound')
    }

    panel.setOptions(conversation.id, { permissionMode: mode })

    return done()
  }

  /**
   * Вопрос сбоку: итог команды - ответ, когда он пришёл. Он уходит только спросившему телефону
   * (итогом его команды), в транскрипт не пишется. id уже занят - отказ askTaken.
   */
  private async aside(
    { panel, conversation }: Owner,
    askId: string,
    question: string,
  ): Promise<Outcome> {
    if (!supports(panel, 'sideQuestion') || !panel.askAside) return fail('refused', UNSUPPORTED)

    const exchange = await panel.askAside(conversation.id, question, askId)

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

/** Откат этой областью - у провайдера, который его умеет (у OpenCode код - только с разговором). */
const rewinds = ({ panel }: Owner, scope: RewindScope): boolean => {
  const { capabilities } = panel.getState()

  return capabilities.rewind && capabilities.rewindScopes.includes(scope)
}
