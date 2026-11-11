import type {
  FeedPatchMessage,
  FeedSnapshotMessage,
} from '@agentic-workstation/remote-protocol/agent-messages'
import type { FeedView } from '@agentic-workstation/remote-protocol/feed'
import { applyFeedPatch, feedFromSnapshot } from '@agentic-workstation/remote-protocol/feed'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

/** Что смотреть: разговор (лента и состояние), прогон или очереди проекта (`*` - все). */
export type WatchTarget =
  | { kind: 'conversation'; conversationId: string }
  | { kind: 'run'; runId: string }
  | { kind: 'queues'; scope: string }

export type WatchDeskHost = {
  send: (agentId: string, message: object) => void
  feedChanged: (agentId: string, view: FeedView) => void
  now: () => number
}

/** Подписываться заново из-за дыры не чаще: догонка идёт заплатками, и дыра в них - та же. */
export const RESYNC_GAP_MS = 2_000

/** Сколько лент держать после ухода с разговора: вернулся - догнал заплатками, а не снимком. */
export const KEPT_FEEDS = 20

/** Место подписки: у IDE на телефон - одна подписка каждого вида (phone-messages.ts). */
const slotOf = (agentId: string, target: WatchTarget): string => `${agentId}|${target.kind}`

const sameTarget = (first: WatchTarget, second: WatchTarget): boolean =>
  JSON.stringify(first) === JSON.stringify(second)

type Watch = { agentId: string; target: WatchTarget; refs: number }

const fieldsOf = (target: WatchTarget) => {
  switch (target.kind) {
    case 'conversation':
      return { conversationId: target.conversationId }
    case 'run':
      return { runId: target.runId }
    case 'queues':
      return { projectKey: target.scope }
  }
}

/**
 * Что телефон смотрит на каждой IDE и ленты разговоров. Правило то же, что у IDE: подписка
 * каждого вида (разговор, прогон, очереди) одна - новая заменяет прежнюю, и IDE делает то же у
 * себя без отписки. Отпустить заменённую - ничего не снять. Подписка считается по числу
 * экранов, которые её держат; лента - снимок и заплатки по номеру. Пропуск номера, обрыв
 * очереди у IDE или новая линия - подписка заново со своего номера (since и epoch): IDE пришлёт
 * только недостающее, а если журнал уже ушёл дальше - снимок.
 *
 * Снимок приходит и без подписки (телефон проснулся, а журнал IDE ушёл дальше): он заменяет
 * ленту целиком, и заплатки дальше считаются от него.
 */
export class WatchDesk {
  private readonly watches = new Map<string, Watch>()
  private readonly feeds = new Map<string, FeedView>()
  private readonly resyncedAt = new Map<string, number>()

  constructor(private readonly host: WatchDeskHost) {}

  watch(agentId: string, target: WatchTarget): () => void {
    const slot = slotOf(agentId, target)
    const known = this.watches.get(slot)
    let watch: Watch

    if (known && sameTarget(known.target, target)) {
      watch = known
      watch.refs += 1
    } else {
      watch = { agentId, target, refs: 1 }
      this.watches.set(slot, watch)
      this.subscribe(agentId, target)
    }

    let released = false

    return () => {
      // Заменённую подписку IDE уже сняла сама: отписка от неё сняла бы новую того же вида.
      if (released || this.watches.get(slot) !== watch) return

      released = true
      watch.refs -= 1

      if (watch.refs > 0) return

      this.watches.delete(slot)
      this.host.send(agentId, { p: PROTOCOL_VERSION, k: 'unsubscribe', ...fieldsOf(target) })
    }
  }

  /** Новая линия, обрыв очереди у IDE или слово релея «переспроси»: всё, что смотрим, - заново. */
  resubscribeAll(agentId: string): void {
    for (const watch of this.watches.values()) {
      if (watch.agentId === agentId) this.subscribe(agentId, watch.target)
    }
  }

  feedOf(agentId: string, conversationId: string): FeedView | undefined {
    return this.feeds.get(`${agentId}|${conversationId}`)
  }

  snapshot(agentId: string, message: FeedSnapshotMessage): void {
    this.keep(agentId, feedFromSnapshot(message))
  }

  /** Заплатка ленты; дыра в номерах - подписка заново со своего номера. */
  patch(agentId: string, message: FeedPatchMessage): void {
    const view = this.feedOf(agentId, message.conversationId)

    if (!view) return

    const next = applyFeedPatch(view, message)

    if (next === view) return
    if (next) return this.keep(agentId, next)

    const key = `${agentId}|${message.conversationId}`
    const now = this.host.now()

    if (now - (this.resyncedAt.get(key) ?? -Infinity) < RESYNC_GAP_MS) return

    this.resyncedAt.set(key, now)
    this.subscribe(agentId, { kind: 'conversation', conversationId: message.conversationId })
  }

  /** Разговора больше нет: его лента не нужна. */
  gone(agentId: string, conversationId: string): void {
    this.feeds.delete(`${agentId}|${conversationId}`)
  }

  /** IDE забыта: её подписки и ленты уходят. */
  forget(agentId: string): void {
    for (const [key, watch] of this.watches) if (watch.agentId === agentId) this.watches.delete(key)
    for (const key of this.feeds.keys()) if (key.startsWith(`${agentId}|`)) this.feeds.delete(key)
  }

  private keep(agentId: string, view: FeedView) {
    const key = `${agentId}|${view.conversationId}`

    // Свежая - в конец очереди: вытесняется давно не открытая.
    this.feeds.delete(key)
    this.feeds.set(key, view)

    while (this.feeds.size > KEPT_FEEDS) {
      const oldest = this.feeds.keys().next().value

      if (oldest === undefined) break

      this.feeds.delete(oldest)
    }

    this.host.feedChanged(agentId, view)
  }

  private subscribe(agentId: string, target: WatchTarget) {
    const view =
      target.kind === 'conversation' ? this.feedOf(agentId, target.conversationId) : undefined

    this.host.send(agentId, {
      p: PROTOCOL_VERSION,
      k: 'subscribe',
      ...fieldsOf(target),
      ...(view && { since: view.seq, epoch: view.epoch }),
    })
  }
}
