import type { FeedPatch, ConversationFeed } from '@shared/claude-feed'

import type {
  AgentMessage,
  FeedPatchMessage,
  FeedSnapshotMessage,
} from '@agentic-workstation/remote-protocol/agent-messages'
import { MAX_BODY_BYTES } from '@agentic-workstation/remote-protocol/frame'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

import type { FoldedPatch } from './feed-journal'
import { emptyFold, foldPatch, FeedJournal } from './feed-journal'
import type { Redact } from './fit'
import { sizeOf, BODY_BUDGET, listThatFits, packsThatFit, tailThatFits } from './fit'

/** Окно складывания заплаток: поток модели не шлёт телефону кадр на каждую пачку букв. */
export const FOLD_MS = 150

/** Сколько элементов в снимке ленты: телефону хватает конца разговора. */
export const SNAPSHOT_ITEMS = 120

/** Задачам ленты - не больше четверти кадра: остальное - самой ленте. */
const TASKS_BUDGET = Math.floor(BODY_BUDGET / 4)

/** Запас на номер и флаг снимка, которые в мерке ещё не настоящие. */
const SHELL_SLACK = 64

/** Журнал, который никто не смотрит, живёт столько: телефон, отошедший на минуту, догонит. */
export const JOURNAL_IDLE_MS = 10 * 60_000

export type FeedDeskHost = {
  /** Лента целиком, как её отдаёт окну провайдер (claude:getFeed). */
  getFeed: (conversationId: string) => Promise<ConversationFeed>
  /** false - не ушло в очередь (ключей нет, тело не влезло). */
  send: (deviceId: string, message: AgentMessage) => boolean
  /** Телефон на связи: спящему лента не шлётся, он догонит по номеру. */
  awake: (deviceId: string) => boolean
  redact: () => Redact
  /** Жизнь этой линии: другой epoch - номера журналов начались заново. */
  epoch: string
  now?: () => number
}

/**
 * Кто смотрит ленту: live - получает заплатки, иначе ещё ждёт свой снимок; sent - номер
 * последней ушедшей ему заплатки (с него он догоняет, проснувшись).
 */
type Watch = { conversationId: string; live: boolean; token: number; sent: number }

/**
 * Ленты разговоров телефонам. Подписка - снимок последних элементов или догонка по номеру из
 * журнала; дальше живые заплатки, сложенные за FOLD_MS, - только телефонам на связи: спящему
 * незачем копить кадры в ящике релея, он догонит из журнала. Журнал заводится на первой
 * подписке и живёт, пока его смотрят, и ещё JOURNAL_IDLE_MS после.
 */
export class FeedDesk {
  private readonly journals = new Map<string, FeedJournal>()
  /** С какого момента журнал никто не смотрит. */
  private readonly unwatched = new Map<string, number>()
  /** Последний номер убранного журнала: новый продолжит после него с пропуском. */
  private readonly retired = new Map<string, number>()
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
  ): Promise<void> {
    const journal = this.journalOf(conversationId)
    const token = (this.tokens += 1)
    const watch: Watch = { conversationId, live: false, token, sent: 0 }
    const previous = this.watches.get(deviceId)?.conversationId

    this.watches.set(deviceId, watch)
    this.unwatched.delete(conversationId)
    // Телефон перешёл на другой разговор: прежний журнал, если его больше никто не смотрит, - к уборке.
    if (previous !== undefined && previous !== conversationId) this.noteUnwatched(previous)
    this.flush(conversationId)

    const caught = epoch === this.host.epoch && since !== undefined ? journal.after(since) : null

    if (caught) {
      watch.sent = since ?? 0
      watch.live = this.sendAll(deviceId, watch, caught)

      return
    }

    await this.snapshot(deviceId, watch, journal)
  }

  /** Телефон больше не смотрит этот разговор; другой разговор этим не снимается. */
  unwatch(deviceId: string, conversationId?: string): void {
    const watch = this.watches.get(deviceId)

    if (!watch || (conversationId !== undefined && watch.conversationId !== conversationId)) return

    this.watches.delete(deviceId)
    this.noteUnwatched(watch.conversationId)
  }

  /** Что смотрит телефон сейчас (для состояния разговора). */
  watching(deviceId: string): string | null {
    return this.watches.get(deviceId)?.conversationId ?? null
  }

  /** Кто какой разговор смотрит: телефон - разговор. */
  watchers(): [string, string][] {
    return [...this.watches].map(([deviceId, watch]) => [deviceId, watch.conversationId])
  }

  /**
   * Телефон проснулся: заплатки, которые ему не слали, пока он спал, - из журнала; журнал
   * ушёл дальше - снимок заново.
   */
  async catchUp(deviceId: string): Promise<void> {
    const watch = this.watches.get(deviceId)
    const journal = watch && this.journals.get(watch.conversationId)

    if (!watch?.live || !journal || journal.lastSeq === watch.sent) return

    const missed = journal.after(watch.sent)

    if (missed) {
      watch.live = this.sendAll(deviceId, watch, missed)

      return
    }

    watch.live = false
    await this.snapshot(deviceId, watch, journal)
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
    this.unwatched.delete(conversationId)
    this.retired.delete(conversationId)
    this.pending.delete(conversationId)

    for (const [deviceId, watch] of this.watches) {
      if (watch.conversationId === conversationId) this.watches.delete(deviceId)
    }
  }

  /** Журналы, которые давно никто не смотрит, уходят: заплатки в них копились бы зря. */
  sweep(): void {
    const now = this.now()

    for (const [conversationId, since] of this.unwatched) {
      if (now - since < JOURNAL_IDLE_MS) continue

      const journal = this.journals.get(conversationId)

      if (journal) this.retired.set(conversationId, journal.lastSeq)

      this.drop(conversationId)
      this.journals.delete(conversationId)
      this.pending.delete(conversationId)
      this.unwatched.delete(conversationId)
    }
  }

  /** Сколько журналов живо - для теста уборки. */
  journalCount(): number {
    return this.journals.size
  }

  stop(): void {
    for (const id of [...this.timers.keys()]) this.drop(id)
  }

  /**
   * Снимок: хвост ленты, сколько влезает в кадр вместе с задачами и конвертом. Не ушёл (ключей
   * нет, кадр не влез) - подписка не живая: заплатки к ленте, которой у телефона нет, - мусор.
   */
  private async snapshot(deviceId: string, watch: Watch, journal: FeedJournal) {
    const base = journal.lastSeq
    const feed = await this.host.getFeed(watch.conversationId)

    // Пока поднимался транскрипт, телефон мог уйти смотреть другое.
    if (this.watches.get(deviceId)?.token !== watch.token) return

    const redact = this.host.redact()
    const tasks = listThatFits(feed.tasks, TASKS_BUDGET, redact)
    const shell: FeedSnapshotMessage = {
      p: PROTOCOL_VERSION,
      k: 'feed',
      conversationId: watch.conversationId,
      epoch: this.host.epoch,
      seq: base,
      items: [],
      tasks,
      hasEarlier: false,
    }
    const budget = MAX_BODY_BYTES - sizeOf(shell) - SHELL_SLACK
    const tail = tailThatFits(feed.items, budget, SNAPSHOT_ITEMS, redact)
    const snapshot = { ...shell, items: tail.items, hasEarlier: feed.hasEarlier || tail.cut }

    if (!this.host.send(deviceId, snapshot)) {
      console.warn('[remote] снимок ленты не ушёл телефону - подписка не живая')
      this.unwatch(deviceId, watch.conversationId)

      return
    }

    watch.sent = base
    // Заплатки, пришедшие, пока читался снимок, - следом: применение по id их не задвоит.
    watch.live = this.sendAll(deviceId, watch, journal.after(base) ?? [])
  }

  /** Заплатки по порядку; первая не ушедшая обрывает ряд - дальше была бы дыра. */
  private sendAll(deviceId: string, watch: Watch, messages: readonly FeedPatchMessage[]): boolean {
    for (const message of messages) {
      if (!this.host.send(deviceId, message)) return false

      watch.sent = message.seq
    }

    return true
  }

  /** Сложенное - в журнал пачками по кадру и живым смотрящим на связи. */
  private flush(conversationId: string) {
    this.drop(conversationId)

    const fold = this.pending.get(conversationId)
    const journal = this.journals.get(conversationId)

    this.pending.delete(conversationId)

    if (!fold || !journal) return

    const redact = this.host.redact()
    const extras = {
      ...(fold.removes.size > 0 && { removes: [...fold.removes] }),
      ...(fold.tasks && { tasks: listThatFits(fold.tasks, TASKS_BUDGET, redact) }),
      ...(fold.hasEarlier !== undefined && { hasEarlier: fold.hasEarlier }),
    }
    // Снятые и задачи едут в первой пачке - место под них вычитается из каждой.
    const packs = packsThatFit([...fold.upserts.values()], BODY_BUDGET - sizeOf(extras), redact)

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
        if (!watch.live || watch.conversationId !== conversationId) continue
        if (!this.host.awake(deviceId)) continue
        if (this.host.send(deviceId, message)) watch.sent = message.seq
      }
    }
  }

  private drop(conversationId: string) {
    const timer = this.timers.get(conversationId)

    if (timer) clearTimeout(timer)

    this.timers.delete(conversationId)
  }

  /** Последний смотревший ушёл: с этого момента журнал считает время до уборки. */
  private noteUnwatched(conversationId: string) {
    const watched = [...this.watches.values()].some((one) => one.conversationId === conversationId)

    if (!watched && this.journals.has(conversationId))
      this.unwatched.set(conversationId, this.now())
  }

  private journalOf(conversationId: string): FeedJournal {
    let journal = this.journals.get(conversationId)

    if (!journal) {
      journal = new FeedJournal(undefined, undefined, this.retired.get(conversationId) ?? 0)
      this.journals.set(conversationId, journal)
    }

    return journal
  }

  private now(): number {
    return this.host.now?.() ?? Date.now()
  }
}
