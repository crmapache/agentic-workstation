import { randomUUID } from 'node:crypto'

import type {
  Conversation,
  AgentPanelState,
  ImageAttachment,
  ClosedConversation,
} from '@shared/conversation'

import type { ConversationRuntime } from '../conversation/conversation-runtime'
import { outranks, ownTitle } from '../tabs/tab-names'
import type { TabRef } from '../tabs/tab-order'
import {
  placeOf,
  regroup,
  pinGroup,
  placeNew,
  moveGroup,
  neighbourOf,
  placeReopened,
  moveWithinGroup,
} from '../tabs/tab-order'
import type { ClosedTab } from './closed-tabs'
import { closedView, takeClosed, isWorthKeeping, rememberClosed } from './closed-tabs'
import type { StoredConversation } from './panel-state'
import { toStored, freshConversation } from './panel-state'

/** Что полосе нужно от сервиса разговоров: сами разговоры, выбранные и рассылка. */
export type TabStripHost = {
  /** Разговоры по id в порядке полосы - тот же Map, что держит сервис. */
  runtimes: () => Map<string, ConversationRuntime>
  activeByProject: () => Record<string, string>
  setActive: (projectPath: string, conversationId: string | null) => void
  /** Новый разговор вкладки - с хостом сервиса. */
  spawn: (conversation: Conversation) => ConversationRuntime
  changed: () => void
  state: () => AgentPanelState
  /** Журнал разговора на диске у провайдера: вкладку с ходами без него не вернуть. */
  hasJournal: (stored: StoredConversation) => Promise<boolean>
  /** Имя от человека - провайдеру: живой сессии словами её CLI, иначе в журнал. */
  saveTitle: (runtime: ConversationRuntime, title: string) => Promise<void>
}

type Ref = TabRef & { runtime: ConversationRuntime }

/** Картинки очереди закрытой вкладки: на диск они не идут, живут до выхода из IDE. */
type QueueImages = ReadonlyMap<string, ImageAttachment[]>

/**
 * Полоса вкладок разговоров: порядок и группы форков, имена, закрытие и возврат
 * закрытых. Сами разговоры держит сервис (claude-service.ts) в Map, порядок вставки
 * которого и есть порядок полосы, - здесь он только переставляется. Решения о
 * порядке - чистые функции tab-order.ts.
 */
export class TabStrip {
  private closed: ClosedTab[] = []
  private readonly closedImages = new Map<string, QueueImages>()

  constructor(private readonly host: TabStripHost) {}

  /** Закрытые вкладки с диска; группы на полосе - подряд, даже если файл писал не я. */
  restore(closed: ClosedTab[]): void {
    const refs = this.refs()
    const grouped = regroup(refs)

    this.closed = closed

    if (grouped.some((ref, place) => refs[place] !== ref)) this.reorder(grouped)
  }

  /** Закрытые вкладки по проекту, последние первыми - для окна. */
  closedByProject(): Record<string, ClosedConversation[]> {
    const view: Record<string, ClosedConversation[]> = {}

    for (const tab of this.closed) {
      const path = tab.stored.projectPath

      view[path] = [...(view[path] ?? []), closedView(tab)]
    }

    return view
  }

  /** Закрытые - на диск: вкладки возвращаются на старте. Картинки очереди остаются в памяти. */
  stored(): ClosedTab[] {
    return this.closed
  }

  /** Новая вкладка встаёт в полосу (форк - за своей группой) и становится выбранной. */
  add(conversation: Conversation): void {
    const runtime = this.host.spawn(conversation)

    this.reorder(placeNew(this.refs(), refOf(runtime)))
    this.host.setActive(conversation.projectPath, conversation.id)
  }

  /**
   * Закрыть вкладку. Была выбранной - выбор переходит к соседу справа, у последней - к
   * соседу слева. Закрытую человеком можно вернуть: помнится всё, кроме пустой «New chat».
   * Закреплённая не закрывается ниоткуда (крестик, ⌘W, телефон, MCP), пока её не открепят.
   */
  async close(conversationId: string, hasDraft: boolean): Promise<AgentPanelState> {
    const runtime = this.runtime(conversationId)

    if (runtime.meta.pinned) return this.host.state()
    const { projectPath } = runtime.meta
    const refs = this.refs()
    const stored = toStored(runtime.meta)

    if (isWorthKeeping(stored, hasDraft)) {
      const tab = { stored, place: placeOf(refs, conversationId), closedAt: Date.now(), hasDraft }

      this.closed = rememberClosed(this.closed, tab)
      this.closedImages.set(conversationId, new Map(runtime.outbox.queueImages))
    }

    if (this.host.activeByProject()[projectPath] === conversationId) {
      this.host.setActive(projectPath, neighbourOf(refs, conversationId))
    }

    this.host.runtimes().delete(conversationId)
    this.dropStaleImages()
    this.host.changed()
    await runtime.dispose()

    return this.host.state()
  }

  /**
   * Вернуть закрытую вкладку под прежним id, в прежнюю группу и на прежнее место, с
   * моделью, очередью (придержанной) и черновиком (его держит окно под этим id).
   * Транскрипт пропал (CLI чистит старые) - вкладка возвращается только ради черновика,
   * имени от человека или очереди, пустой от разговора; иначе - следующая.
   */
  async reopen(projectPath: string, closedId: string | null): Promise<AgentPanelState> {
    const runtimes = this.host.runtimes()
    const ofProject = this.closed.filter((tab) => tab.stored.projectPath === projectPath)
    const { tab } = takeClosed(ofProject, closedId, (id) => runtimes.has(id))

    this.closed = this.closed.filter((item) => item !== tab && !runtimes.has(item.stored.id))

    if (!tab) return this.host.state()

    const stored = await this.revive(tab)

    if (!stored) return closedId === null ? this.reopen(projectPath, null) : this.host.state()

    const runtime = this.host.spawn(freshConversation(stored))

    runtime.outbox.adoptQueue(this.closedImages.get(stored.id) ?? new Map())
    this.closedImages.delete(stored.id)
    this.reorder(placeReopened(this.refs(), refOf(runtime), tab.place))
    this.host.setActive(projectPath, stored.id)

    return this.host.state()
  }

  /** Имя от человека: перебивает любое, едет в транскрипт. Пустое - имя прежнее. */
  async rename(conversationId: string, text: string): Promise<AgentPanelState> {
    const runtime = this.runtime(conversationId)
    const title = ownTitle(text)

    if (!title || !outranks('user', runtime.meta.titleSource)) return this.host.state()

    // Модель больше не называет разговор: имя от человека ей не перебить (session-title.ts).
    runtime.update({ title, titleSource: 'user' })
    await this.host.saveTitle(runtime, title)

    return this.host.state()
  }

  /** Перенести группу форков целиком перед группой before (null - в конец). */
  moveGroup(groupId: string, before: string | null): AgentPanelState {
    const next = moveGroup(this.refs(), groupId, before)

    if (next) this.reorder(next)

    return this.host.state()
  }

  /**
   * Закрепить или открепить вкладку - вместе с её группой форков: группа стоит подряд, и зона
   * закреплённых в начале полосы не режет её надвое.
   */
  setPinned(conversationId: string, pinned: boolean): AgentPanelState {
    const next = pinGroup(this.refs(), this.runtime(conversationId).meta.groupId, pinned)

    if (next) this.reorder(next)

    return this.host.state()
  }

  /** Переставить форк внутри своей группы перед вкладкой before (null - в конец группы). */
  moveTab(conversationId: string, before: string | null): AgentPanelState {
    const next = moveWithinGroup(this.refs(), conversationId, before)

    if (next) this.reorder(next)

    return this.host.state()
  }

  /**
   * Закрытая вкладка, готовая встать на полосу, или null - возвращать нечего. Пропал
   * транскрипт - разговор начинается заново под новым id сессии.
   */
  private async revive(tab: ClosedTab): Promise<StoredConversation | null> {
    const { stored, hasDraft } = tab
    const hadConversation = (stored.outcome ?? 'none') !== 'none'

    if (!hadConversation || (await this.host.hasJournal(stored))) {
      return stored
    }

    const keep = hasDraft || stored.titleSource === 'user' || stored.queue.length > 0

    if (!keep) return null

    return {
      ...stored,
      sessionId: randomUUID(),
      title: stored.titleSource === 'user' ? stored.title : '',
      titleSource: stored.titleSource === 'user' ? 'user' : 'default',
      outcome: 'none',
      fork: null,
    }
  }

  private runtime(conversationId: string): ConversationRuntime {
    const runtime = this.host.runtimes().get(conversationId)

    if (!runtime) throw new Error(`Разговора ${conversationId} нет`)

    return runtime
  }

  private refs(): Ref[] {
    return [...this.host.runtimes().values()].map(refOf)
  }

  /** Порядок полосы - порядок вставки в Map: переставить значит вставить заново. */
  private reorder(next: readonly Ref[]) {
    const runtimes = this.host.runtimes()

    runtimes.clear()

    for (const ref of next) {
      const { meta } = ref.runtime

      if (
        ref.depth !== meta.depth ||
        ref.groupId !== meta.groupId ||
        Boolean(ref.pinned) !== Boolean(meta.pinned)
      ) {
        ref.runtime.update({ depth: ref.depth, groupId: ref.groupId, pinned: ref.pinned === true })
      }

      runtimes.set(ref.id, ref.runtime)
    }

    this.host.changed()
  }

  /** Картинки очереди держатся, пока их вкладку можно вернуть. */
  private dropStaleImages() {
    const kept = new Set(this.closed.map((tab) => tab.stored.id))

    for (const id of this.closedImages.keys()) if (!kept.has(id)) this.closedImages.delete(id)
  }
}

const refOf = (runtime: ConversationRuntime): Ref => ({
  id: runtime.meta.id,
  groupId: runtime.meta.groupId,
  depth: runtime.meta.depth,
  projectPath: runtime.meta.projectPath,
  pinned: runtime.meta.pinned === true,
  runtime,
})
