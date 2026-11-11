import type { FeedPatch, ConversationFeed } from '@shared/claude-feed'

import type {
  AgentMessage,
  FeedPatchMessage,
} from '@agentic-workstation/remote-protocol/agent-messages'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'
import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'

import type { FoldedPatch } from './feed-journal'
import { emptyFold, foldPatch, FeedJournal } from './feed-journal'
import { sizeOf, BODY_BUDGET, packsThatFit, tailThatFits } from './fit'

/** Окно складывания заплаток: поток модели не шлёт телефону кадр на каждую пачку букв. */
export const FOLD_MS = 150

/** Сколько элементов в снимке ленты: телефону хватает конца разговора. */
export const SNAPSHOT_ITEMS = 120

export type FeedDeskHost = {
  /** Лента целиком, как её отдаёт окну провайдер (claude:getFeed). */
  getFeed: (conversationId: string) => Promise<ConversationFeed>
  send: (deviceId: string, message: AgentMessage) => void
  /** Жизнь этой линии: другой epoch - номера журналов начались заново. */
  epoch: string
}

/** Кто смотрит ленту: live - получает заплатки, иначе ещё ждёт свой снимок. */
type Watch = { conversationId: string; live: boolean; token: number }

/**
 * Ленты разговоров телефонам. Подписка - снимок последних элементов или догонка по номеру из
 * журнала; дальше живые заплатки, сложенные за FOLD_MS. Журнал заводится на первой подписке
 * и живёт, пока жив разговор: телефон, отошедший на минуту, догоняет заплатками, а не снимком.
 */
export class FeedDesk {
  private readonly journals = new Map<string, FeedJournal>()
  private readonly watches = new Map<string, Watch>()
  private readonly pending = new Map<string, FoldedPatch>()
  private readonly timers = new Map<string, NodeJS.Timeout>()
  private tokens = 0

  constructor(private readonly host: FeedDeskHost) {}

  /** Телефон смотрит разговор; since и epoch - что у него уже есть. */
  async watch(
    deviceId: string,
    conversationId: string,
    since: number | undefined,
    epoch: string | undefined,
  ) {
    const journal = this.journalOf(conversationId)
    const token = (this.tokens += 1)
    const watch: Watch = { conversationId, live: false, token }

    this.watches.set(deviceId, watch)
    this.flush(conversationId)

    const caught = epoch === this.host.epoch && since !== undefined ? journal.after(since) : null

    if (caught) {
      for (const message of caught) this.host.send(deviceId, message)

      watch.live = true

      return
    }

    const base = journal.lastSeq
    const feed = await this.host.getFeed(conversationId)

    // Пока поднимался транскрипт, телефон мог уйти смотреть другое.
    if (this.watches.get(deviceId)?.token !== token) return

    const tail = tailThatFits<FeedItemWire>(feed.items, BODY_BUDGET, SNAPSHOT_ITEMS)

    this.host.send(deviceId, {
      p: PROTOCOL_VERSION,
      k: 'feed',
      conversationId,
      epoch: this.host.epoch,
      seq: base,
      items: tail.items,
      tasks: feed.tasks,
      hasEarlier: feed.hasEarlier || tail.cut,
    })

    // Заплатки, пришедшие, пока читался снимок, - следом: применение по id их не задвоит.
    for (const message of journal.after(base) ?? []) this.host.send(deviceId, message)

    watch.live = true
  }

  unwatch(deviceId: string): void {
    this.watches.delete(deviceId)
  }

  /** Что смотрит телефон сейчас (для состояния разговора). */
  watching(deviceId: string): string | null {
    return this.watches.get(deviceId)?.conversationId ?? null
  }

  /** Кто какой разговор смотрит: телефон - разговор. */
  watchers(): [string, string][] {
    return [...this.watches].map(([deviceId, watch]) => [deviceId, watch.conversationId])
  }

  /** Живая заплатка ленты провайдера. Лента, которую никто не смотрел, телефонам не нужна. */
  patched(patch: FeedPatch): void {
    const id = patch.conversationId

    if (!this.journals.has(id)) return

    this.pending.set(id, foldPatch(this.pending.get(id) ?? emptyFold(), patch))

    if (!this.timers.has(id)) {
      const timer = setTimeout(() => this.flush(id), FOLD_MS)

      timer.unref()
      this.timers.set(id, timer)
    }
  }

  /** Разговора больше нет: журнал и смотрящие уходят. */
  forget(conversationId: string): void {
    this.drop(conversationId)
    this.journals.delete(conversationId)
    this.pending.delete(conversationId)

    for (const [deviceId, watch] of this.watches) {
      if (watch.conversationId === conversationId) this.watches.delete(deviceId)
    }
  }

  stop(): void {
    for (const id of [...this.timers.keys()]) this.drop(id)
  }

  /** Сложенное - в журнал пачками по кадру и живым смотрящим. */
  private flush(conversationId: string) {
    this.drop(conversationId)

    const fold = this.pending.get(conversationId)
    const journal = this.journals.get(conversationId)

    this.pending.delete(conversationId)

    if (!fold || !journal) return

    const extras = {
      ...(fold.removes.size > 0 && { removes: [...fold.removes] }),
      ...(fold.tasks && { tasks: fold.tasks }),
      ...(fold.hasEarlier !== undefined && { hasEarlier: fold.hasEarlier }),
    }
    // Снятые и задачи едут в первой пачке - место под них вычитается из каждой.
    const packs = packsThatFit<FeedItemWire>(
      [...fold.upserts.values()],
      BODY_BUDGET - sizeOf(extras),
    )

    for (const [index, upserts] of (packs.length > 0 ? packs : [[]]).entries()) {
      const message = journal.append(
        (seq): FeedPatchMessage => ({
          p: PROTOCOL_VERSION,
          k: 'patch',
          conversationId,
          epoch: this.host.epoch,
          seq,
          upserts,
          ...(index === 0 && extras),
        }),
        sizeOf(upserts),
      )

      for (const [deviceId, watch] of this.watches) {
        if (watch.live && watch.conversationId === conversationId) this.host.send(deviceId, message)
      }
    }
  }

  private drop(conversationId: string) {
    const timer = this.timers.get(conversationId)

    if (timer) clearTimeout(timer)

    this.timers.delete(conversationId)
  }

  private journalOf(conversationId: string): FeedJournal {
    let journal = this.journals.get(conversationId)

    if (!journal) {
      journal = new FeedJournal()
      this.journals.set(conversationId, journal)
    }

    return journal
  }
}
