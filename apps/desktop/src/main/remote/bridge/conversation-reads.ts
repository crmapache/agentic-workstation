import { isProviderId } from '@shared/providers'

import type { RemoteErrorCode } from '@agentic-workstation/remote-protocol/agent-messages'
import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'

import type { BridgePorts } from './bridge-ports'
import type { Outcome } from './command-ledger'
import type { Redact } from './fit'
import type { ProjectKeys } from './project-keys'
import { pageBefore, historyThatFits, pictureThatFits } from './reads-fit'

const done = (data: unknown): Outcome => ({ ok: true, data })

const fail = (code: RemoteErrorCode, detail?: string): Outcome =>
  detail === undefined ? { ok: false, code } : { ok: false, code, detail }

/**
 * Чтение разговоров по просьбе телефона: история проекта и продолжение прошлого разговора,
 * страница ленты выше того, что у телефона, картинка сообщения для просмотра. Те же методы
 * ClaudeService, что зовёт окно (claude:listHistory, openHistory, loadEarlier, getImage); ответ
 * каждой команды влезает в один кадр (reads-fit.ts). Разговор - только в открытом проекте:
 * проверку его id и проекта делает CommandDesk до того, как позвать сюда.
 */
export class ConversationReads {
  constructor(
    private readonly ports: BridgePorts,
    private readonly keys: () => ProjectKeys,
    private readonly redact: () => Redact,
  ) {}

  async history(args: CommandArgs<'conversation.history'>): Promise<Outcome> {
    const path = this.projectPath(args.projectKey, args.provider)

    if (typeof path !== 'string') return path

    return done(historyThatFits(await this.ports.conversations.history(path), this.redact()))
  }

  /**
   * Продолжить прошлый разговор. Уже открытый вкладкой - его id, без openHistory: тот выбрал бы
   * его вкладку в окне IDE, а человек за столом смотрит, может быть, на другую.
   */
  async openHistory(args: CommandArgs<'conversation.openHistory'>): Promise<Outcome> {
    const path = this.projectPath(args.projectKey, args.provider)

    if (typeof path !== 'string') return path

    const { conversations } = this.ports
    const open = conversations
      .getState()
      .conversations.find(
        (conversation) =>
          conversation.projectPath === path && conversation.sessionId === args.sessionId,
      )
    const id = open?.id ?? (await conversations.openHistory(path, args.sessionId))

    return id ? done({ conversationId: id }) : fail('notFound')
  }

  /**
   * Страница перед самым ранним элементом телефона. Он первый и в ленте IDE, а выше есть
   * транскрипт - сначала страница транскрипта в ленту IDE (как «load earlier» окна): лента IDE
   * растёт вверх, и следующая просьба телефона, как и окна, пойдёт уже от неё.
   */
  async earlier(args: CommandArgs<'conversation.earlier'>): Promise<Outcome> {
    const { conversations } = this.ports
    let feed = await conversations.getFeed(args.conversationId)
    const at = feed.items.findIndex((item) => item.id === args.before)

    if (at === 0 && feed.hasEarlier) feed = await conversations.loadEarlier(args.conversationId)

    const page = pageBefore(feed.items, args.before, feed.hasEarlier, this.redact())

    return page ? done(page) : fail('notFound')
  }

  /** Картинка сообщения: целиком, если влезает в кадр, иначе уменьшенная; нет - notFound. */
  async image(args: CommandArgs<'conversation.image'>): Promise<Outcome> {
    const { conversations, pictures } = this.ports
    const original = await conversations.image(args.conversationId, args.messageId, args.index)

    if (!original) return fail('notFound')

    const fitted = pictureThatFits(original, (dataUrl, edge, quality) =>
      pictures.shrink(dataUrl, edge, quality),
    )

    return fitted ? done(fitted) : fail('refused', 'imageTooBig')
  }

  /** Папка открытого проекта по ключу и провайдер с историей; иначе - отказ. */
  private projectPath(projectKey: string, provider: string): string | Outcome {
    const keys = this.keys()
    const path = keys.openPathOf(projectKey)

    if (!path) return fail(keys.pathOf(projectKey) ? 'notOpen' : 'notFound')
    if (!isProviderId(provider)) return fail('refused', 'providerMissing')

    return path
  }
}
