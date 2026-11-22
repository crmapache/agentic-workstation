import type { EffortLevel, RequestResponse } from '@shared/conversation'

import type { Command, CommandArgs } from '@agentic-workstation/remote-protocol/commands'

import { withFiles } from './attached-files'
import type { BridgePorts, ConversationsPort } from './bridge-ports'
import type { Outcome } from './command-ledger'
import { ConversationReads } from './conversation-reads'
import { ConversationTools } from './conversation-tools'
import type { Redact } from './fit'
import type { ModeGate } from './mode-gate'
import { done, fail } from './outcomes'
import type { Owner } from './panels'
import { ownerOf, panelOf } from './panels'
import type { ProjectKeys } from './project-keys'

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
 * Уровень усилия, который знает провайдер панели (capabilities.efforts): протокол знает уровни
 * всех провайдеров, а чужой уровень CLI не примет (ultra у Claude Code). null - как в настройках.
 */
const knowsEffort = (panel: ConversationsPort, effort: EffortLevel | null | undefined): boolean =>
  effort === null || effort === undefined || panel.getState().capabilities.efforts.includes(effort)

/**
 * Команды разговоров - публичными методами панелей провайдеров, теми же, что зовёт окно (ADR
 * 0083): команду по id разговора ведёт панель, у которой этот разговор, новый разговор и
 * историю - панель провайдера, которого выбрал телефон. Разговор - только в открытом проекте;
 * проект - по ключу из тех, что IDE назвала сама. Чтение по просьбе (история, страница выше,
 * картинка, поиск) - ConversationReads; служебное поверх разговора (очередь, остановки, вопрос
 * сбоку, откат) - ConversationTools.
 */
export class ConversationCommands {
  private readonly reads: ConversationReads
  private readonly tools: ConversationTools

  constructor(
    private readonly ports: BridgePorts,
    private readonly keys: () => ProjectKeys,
    redact: () => Redact,
    private readonly modes: ModeGate,
  ) {
    this.reads = new ConversationReads(ports, keys, redact)
    this.tools = new ConversationTools(ports, redact, modes)
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

  /** Команды одному разговору: он есть у какой-то панели и его проект открыт - иначе отказ. */
  private async inConversation(command: ConversationCommand): Promise<Outcome> {
    const id = 'conversationId' in command.args ? command.args.conversationId : ''
    const owner = ownerOf(this.ports.panels, id)

    if (!owner) return fail('notFound')
    if (!this.keys().isOpen(owner.conversation.projectPath)) return fail('notOpen')

    const { panel } = owner

    switch (command.name) {
      case 'conversation.send': {
        const { images = [], files = [] } = command.args
        const text = await withFiles(command.args.text, files, this.ports.panels.saveFile)

        if (text === null) return fail('refused', 'fileNotSaved')

        await panel.send(id, { text, images })

        return done()
      }
      case 'conversation.respond':
        return this.respond(owner, command.args)
      case 'conversation.interrupt':
        panel.interrupt(id)

        return done()
      case 'conversation.rename':
        await panel.rename(id, command.args.title)

        return done()
      case 'conversation.setModel':
        panel.setOptions(id, { model: command.args.model })

        return done()
      case 'conversation.setEffort':
        if (!knowsEffort(panel, command.args.effort)) return fail('refused', 'effortUnavailable')

        panel.setOptions(id, { effort: command.args.effort })

        return done()
      case 'conversation.earlier':
        return this.reads.earlier(panel, command.args)
      case 'conversation.image':
        return this.reads.image(panel, command.args)
      default:
        return this.tools.run(command, owner)
    }
  }

  /**
   * Ответ на вопрос, которого уже нет (ответили за столом, вопрос снят, стоит следующий), -
   * отказ, а не «ок»: иначе телефон считал бы, что ответил он, а ответ никуда не лёг.
   */
  private respond(
    { panel, conversation }: Owner,
    args: CommandArgs<'conversation.respond'>,
  ): Outcome {
    const { requestId, decision } = args
    const { pending } = conversation

    if (pending?.requestId !== requestId) return fail('questionGone')
    // Ответ не того вида на тот же вопрос - не ответ.
    if (pending.kind !== decision.kind) return fail('badArgs')

    panel.respond(conversation.id, requestId, responseOf(decision))

    return done()
  }

  /**
   * Новый разговор с телефона - вкладкой панели выбранного провайдера. Чего телефон не выбрал
   * (модель, усилие, режим), то - как у новой вкладки окна этого провайдера: закреплённое в
   * Settings → New chats, иначе как у выбранной вкладки проекта. Режим, которого окно не дало бы
   * (ADR 0076: не этого провайдера, bypass под запретом настроек, auto, от которого CLI
   * отказался), - отказ modeUnavailable: выбранный, кроме auto, - ещё до вкладки; auto и режим
   * «как в окне» - по вкладке, которая вышла. Вышел не тот режим или недоступный - разговор
   * закрывается, а телефону отказ.
   */
  private async newConversation(args: CommandArgs<'conversation.new'>): Promise<Outcome> {
    const path = this.keys().openPathOf(args.projectKey)

    if (!path) return fail(this.keys().pathOf(args.projectKey) ? 'notOpen' : 'notFound')

    const panel = panelOf(this.ports.panels, args.provider)

    if (!panel) return fail('refused', 'providerMissing')
    if (!knowsEffort(panel, args.effort)) return fail('refused', 'effortUnavailable')

    const chosen = args.permissionMode
    const { provider } = panel

    if (chosen && !(await this.modes.allows(provider, chosen, path, null))) {
      return fail('refused', 'modeUnavailable')
    }

    const id = await panel.newConversation(path, {
      ...(args.model !== undefined && { model: args.model }),
      ...(args.effort !== undefined && { effort: args.effort }),
      ...(chosen && { permissionMode: chosen }),
    })
    const created = panel.getState().conversations.find((one) => one.id === id)

    if (!created) return fail('failed')

    const mode = created.permissionMode
    const asked = !chosen || mode === chosen

    if (!asked || !(await this.modes.allows(provider, mode, path, created))) {
      console.warn(`[remote] новый разговор вышел в режиме ${mode} - закрыт`)
      await panel.close(id)

      return fail('refused', asked ? 'modeUnavailable' : 'permissionMode')
    }

    return done({ conversationId: id })
  }
}
