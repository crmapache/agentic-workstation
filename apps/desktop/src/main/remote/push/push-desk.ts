import type { Conversation } from '@shared/claude'
import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { ScenarioRun } from '@shared/scenario-runs'
import { isRunFinished } from '@shared/scenario-runs'

import type { PushNotice } from '@agentic-workstation/remote-protocol/push'
import { PUSH_REASONS } from '@agentic-workstation/remote-protocol/push'

import { AWAKE_MS } from '../agent/remote-agent'
import type { Redact } from '../bridge/fit'
import type { ProjectKeys } from '../bridge/project-keys'
import type { Attention, ConversationEvent } from './attention'
import { attentionId, attentionOf } from './attention'

/** Одного повода у одного разговора или очереди - не чаще раза в минуту. */
export const COALESCE_MS = 60_000

/** И всего телефону - не больше этого в минуту: десять разговоров разом - не десять звонков. */
export const PUSHES_PER_MINUTE = 10

/** Событие (упал, лимит, доплата) живёт полчаса: потом звать о нём уже поздно. */
export const EVENT_LIFE_MS = 30 * 60_000

/** Перемены состояния идут пачкой (каждая буква ответа): решать - раз за такт. */
const SETTLE_MS = 100

export type PushDeskHost = {
  conversations: () => readonly Conversation[]
  queues: () => ScenarioQueuesView
  /** Ключи и подмена папок - те же, что у линии (Bridge.lens). */
  lens: () => { keys: ProjectKeys; redact: Redact }
  /** Телефоны с подпиской на пуши. */
  subscribers: () => readonly string[]
  /** Когда телефон говорил последний раз; 0 - не говорил с начала линии. */
  heardAt: (deviceId: string) => number
  /** false - будить нечем (подписки или ключа уже нет). */
  send: (deviceId: string, notice: PushNotice) => boolean
  now?: () => number
}

const MINUTE_MS = 60_000

const rank = (attention: Attention): number => PUSH_REASONS.indexOf(attention.reason)

/**
 * Когда будить телефон. Пуш - только тому, кто не на связи и не слышал о поводе сам:
 *
 * - повод считается увиденным, если телефон говорил после его появления - линия была жива, и
 *   список с «ждёт тебя» до него дошёл. Телефон на связи, но молчит (экран только что погас,
 *   а 45 с ещё не прошли) - ждём: заговорит - видел, замолчит совсем - будим;
 * - что было до начала линии или до подписки телефона, не будит: IDE после перезапуска не
 *   звонит обо всём, что стоит с утра;
 * - один повод одного разговора или очереди - не чаще раза в минуту; новый за минуту ждёт её
 *   конца и уходит, если ещё не решён. Из нескольких поводов одного тега уходит важнейший
 *   (порядок PUSH_REASONS), остальные считаются сказанными: уведомление одно на тег.
 */
export class PushDesk {
  private readonly startedAt: number
  private readonly firstSeen = new Map<string, number>()
  private events: ConversationEvent[] = []
  private readonly runs = new Map<string, ScenarioRun>()
  private readonly subscribedAt = new Map<string, number>()
  /** Сказанное каждому телефону - пушем или вместе с важнейшим поводом того же тега. */
  private readonly told = new Map<string, Set<string>>()
  /** Последний пуш по тегу и поводу - для паузы в минуту. */
  private readonly lastPush = new Map<string, Map<string, number>>()
  private readonly recent = new Map<string, number[]>()
  private wakeTimer: NodeJS.Timeout | null = null
  private settleTimer: NodeJS.Timeout | null = null

  constructor(private readonly host: PushDeskHost) {
    this.startedAt = this.now()
    // Что стоит уже сейчас, - точка отсчёта, а не повод: первая встреча у него «до линии».
    for (const attention of this.collect()) this.firstSeen.set(attentionId(attention), 0)
  }

  /** Перемена в IDE: решить чуть позже, когда пачка перемен уляжется. */
  soon(): void {
    this.settleTimer ??= setTimeout(() => {
      this.settleTimer = null
      this.evaluate()
    }, SETTLE_MS)
    this.settleTimer.unref()
  }

  runChanged(run: ScenarioRun): void {
    if (isRunFinished(run.state)) this.runs.delete(run.id)
    else this.runs.set(run.id, run)

    this.soon()
  }

  /** Разговор позвал человека. Звать телефон - только о том, что не видно по состоянию. */
  called(event: ConversationEvent): void {
    this.events = [...this.events, event]
    this.soon()
  }

  /** Подписка телефона появилась или сменилась (новая - новая точка отсчёта) или ушла. */
  subscribed(deviceId: string, present: boolean): void {
    if (!present) return this.forget(deviceId)

    this.subscribedAt.set(deviceId, this.now())
    this.soon()
  }

  forget(deviceId: string): void {
    this.subscribedAt.delete(deviceId)
    this.told.delete(deviceId)
    this.lastPush.delete(deviceId)
    this.recent.delete(deviceId)
  }

  stop(): void {
    for (const timer of [this.wakeTimer, this.settleTimer]) if (timer) clearTimeout(timer)

    this.wakeTimer = null
    this.settleTimer = null
  }

  /** Решить сейчас: кого будить и когда посмотреть снова. */
  evaluate(): void {
    const now = this.now()

    this.events = this.events.filter((event) => now - event.at < EVENT_LIFE_MS)

    const all = this.collect()
    const present = new Set(all.map(attentionId))

    for (const id of present) if (!this.firstSeen.has(id)) this.firstSeen.set(id, now)
    for (const id of this.firstSeen.keys()) if (!present.has(id)) this.firstSeen.delete(id)

    let wake = Infinity

    for (const deviceId of this.host.subscribers()) {
      wake = Math.min(wake, this.serve(deviceId, all, now))

      const told = this.told.get(deviceId)

      if (told) for (const id of told) if (!present.has(id)) told.delete(id)
    }

    this.schedule(wake, now)
  }

  /** Один телефон: что ему пора сказать; ответ - когда посмотреть снова (Infinity - незачем). */
  private serve(deviceId: string, all: readonly Attention[], now: number): number {
    const baseline = Math.max(this.startedAt, this.subscribedAt.get(deviceId) ?? 0)
    const heard = this.host.heardAt(deviceId)
    const told = this.told.get(deviceId) ?? new Set<string>()
    const due = all.filter((attention) => {
      const appeared = this.appeared(attention)

      return appeared >= baseline && heard <= appeared && !told.has(attentionId(attention))
    })

    if (due.length === 0) return Infinity
    // На связи и молчит - может, ещё увидит сам: решится, когда он заговорит или замолчит совсем.
    if (now - heard < AWAKE_MS) return heard + AWAKE_MS

    this.told.set(deviceId, told)

    let wake = Infinity

    for (const group of byTag(due)) {
      const top = [...group].sort((first, second) => rank(first) - rank(second))[0]

      if (!top) continue

      const wait = this.waitFor(deviceId, `${top.tag}|${top.reason}`, now)

      if (wait > now) {
        wake = Math.min(wake, wait)
        continue
      }

      if (!this.host.send(deviceId, { p: 1, ...top.notice, at: now })) continue

      this.sent(deviceId, `${top.tag}|${top.reason}`, now)

      for (const attention of group) told.add(attentionId(attention))
    }

    return wake
  }

  /** Когда можно пушить этот тег и повод: после паузы в минуту и в пределах телефона. */
  private waitFor(deviceId: string, slot: string, now: number): number {
    const last = this.lastPush.get(deviceId)?.get(slot)
    const recent = (this.recent.get(deviceId) ?? []).filter((at) => now - at < MINUTE_MS)

    this.recent.set(deviceId, recent)

    const afterSlot = last === undefined ? 0 : last + COALESCE_MS
    const afterDevice = recent.length >= PUSHES_PER_MINUTE ? (recent[0] ?? now) + MINUTE_MS : 0

    return Math.max(afterSlot, afterDevice)
  }

  private sent(deviceId: string, slot: string, now: number) {
    const slots = this.lastPush.get(deviceId) ?? new Map<string, number>()

    for (const [key, at] of slots) if (now - at >= COALESCE_MS) slots.delete(key)

    slots.set(slot, now)
    this.lastPush.set(deviceId, slots)
    this.recent.set(deviceId, [...(this.recent.get(deviceId) ?? []), now])
  }

  private appeared(attention: Attention): number {
    return attention.since ?? this.firstSeen.get(attentionId(attention)) ?? 0
  }

  private collect(): Attention[] {
    const { keys, redact } = this.host.lens()

    return attentionOf({
      conversations: this.host.conversations(),
      events: this.events,
      queues: this.host.queues(),
      runs: this.runs,
      keys,
      redact,
    })
  }

  private schedule(wake: number, now: number) {
    if (this.wakeTimer) clearTimeout(this.wakeTimer)

    this.wakeTimer = null

    if (!Number.isFinite(wake)) return

    this.wakeTimer = setTimeout(
      () => {
        this.wakeTimer = null
        this.evaluate()
      },
      Math.max(0, wake - now) + 50,
    )
    this.wakeTimer.unref()
  }

  private now(): number {
    return this.host.now?.() ?? Date.now()
  }
}

const byTag = (attentions: readonly Attention[]): Attention[][] => {
  const groups = new Map<string, Attention[]>()

  for (const attention of attentions) {
    groups.set(attention.tag, [...(groups.get(attention.tag) ?? []), attention])
  }

  return [...groups.values()]
}
