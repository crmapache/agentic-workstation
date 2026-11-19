import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'

import type { BridgePorts, ConversationsPort } from './bridge-ports'
import type { Outcome } from './command-ledger'
import { searchWire, aiSearchWire } from './conversation-extras-wire'
import type { Redact } from './fit'
import { done, fail } from './outcomes'
import { panelOf } from './panels'
import type { ProjectKeys } from './project-keys'
import { pageBefore, historyThatFits, pictureThatFits, feedWithRowAbove } from './reads-fit'

/**
 * Прогоны поиска модели с телефона - под своей приставкой: номер называет телефон, и с номером
 * прогона окна он не совпадёт и чужой прогон не отменит.
 */
const remoteRun = (runId: string) => `remote:${runId}`

/**
 * Чтение разговоров по просьбе телефона: история проекта у провайдера и продолжение прошлого
 * разговора, страница ленты выше того, что у телефона, картинка сообщения для просмотра. Те же
 * методы панели провайдера, что зовёт окно (agent:listHistory, openHistory, loadEarlier,
 * getImage); ответ каждой команды влезает в один кадр (reads-fit.ts). Разговор - только в
 * открытом проекте: его панель, id и проект находит ConversationCommands до того, как позвать
 * сюда. Поиск по разговорам - тоже чтение, только у Claude Code: набранный - индексом IDE,
 * описанный - моделью (SearchDesk).
 */
export class ConversationReads {
  constructor(
    private readonly ports: BridgePorts,
    private readonly keys: () => ProjectKeys,
    private readonly redact: () => Redact,
  ) {}

  /**
   * История проекта - и недавнего, закрытого: список прошлых разговоров - заголовки и даты того,
   * что телефон и так может прочесть целиком. Продолжить разговор - только в открытом.
   */
  async history(args: CommandArgs<'conversation.history'>): Promise<Outcome> {
    const path = this.keys().pathOf(args.projectKey)

    if (!path) return fail('notFound')

    const panel = panelOf(this.ports.panels, args.provider)

    if (!panel) return fail('refused', 'providerMissing')

    return done(historyThatFits(await panel.history(path), this.redact()))
  }

  /** Набранный поиск по разговорам открытого проекта - индексом IDE, находки в один кадр. */
  async search(args: CommandArgs<'conversation.search'>): Promise<Outcome> {
    const path = this.openPath(args.projectKey)

    if (typeof path !== 'string') return path

    return done(searchWire(await this.ports.search.find(path, args.query), this.redact()))
  }

  /**
   * Описанный поиск - модели, только чтение в папке разговоров текстом. Итог - когда она кончила;
   * отмена (searchCancel) кончает его отменой.
   */
  async searchAi(args: CommandArgs<'conversation.searchAi'>): Promise<Outcome> {
    const path = this.openPath(args.projectKey)

    if (typeof path !== 'string') return path

    const outcome = await this.ports.search.ask(path, remoteRun(args.runId), args.query)

    return done(aiSearchWire(outcome, this.redact()))
  }

  searchCancel(args: CommandArgs<'conversation.searchCancel'>): Outcome {
    this.ports.search.cancel(remoteRun(args.runId))

    return done()
  }

  /**
   * Продолжить прошлый разговор. Уже открытый вкладкой - его id, без openHistory: тот выбрал бы
   * его вкладку в окне IDE, а человек за столом смотрит, может быть, на другую.
   */
  async openHistory(args: CommandArgs<'conversation.openHistory'>): Promise<Outcome> {
    const path = this.openPath(args.projectKey)

    if (typeof path !== 'string') return path

    const panel = panelOf(this.ports.panels, args.provider)

    if (!panel) return fail('refused', 'providerMissing')

    const open = panel
      .getState()
      .conversations.find(
        (conversation) =>
          conversation.projectPath === path && conversation.sessionId === args.sessionId,
      )
    const id = open?.id ?? (await panel.openHistory(path, args.sessionId))

    return id ? done({ conversationId: id }) : fail('notFound')
  }

  /**
   * Страница строк перед самой ранней строкой телефона. Выше неё в ленте IDE строк нет, а есть
   * транскрипт - сначала его страницы в ленту IDE (как «load earlier» окна, feedWithRowAbove).
   */
  async earlier(
    panel: ConversationsPort,
    args: CommandArgs<'conversation.earlier'>,
  ): Promise<Outcome> {
    const feed = await feedWithRowAbove(await panel.getFeed(args.conversationId), args.before, () =>
      panel.loadEarlier(args.conversationId),
    )
    const page = feed && pageBefore(feed.items, args.before, feed.hasEarlier, this.redact())

    return page ? done(page) : fail('notFound')
  }

  /** Картинка сообщения: целиком, если влезает в кадр, иначе уменьшенная; нет - notFound. */
  async image(panel: ConversationsPort, args: CommandArgs<'conversation.image'>): Promise<Outcome> {
    const { pictures } = this.ports
    const original = await panel.image(args.conversationId, args.messageId, args.index)

    if (!original) return fail('notFound')

    const fitted = pictureThatFits(original, (dataUrl, edge, quality) =>
      pictures.shrink(dataUrl, edge, quality),
    )

    return fitted ? done(fitted) : fail('refused', 'imageTooBig')
  }

  /** Папка открытого проекта по ключу; закрытый - notOpen, незнакомый - notFound. */
  private openPath(projectKey: string): string | Outcome {
    const keys = this.keys()
    const path = keys.openPathOf(projectKey)

    return path ?? fail(keys.pathOf(projectKey) ? 'notOpen' : 'notFound')
  }
}
