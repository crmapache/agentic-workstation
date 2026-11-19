import type { CarryOnReason } from '@shared/panel-extras'

import type { CliMessage } from '../cli/cli-messages'
import { numberField, recordField, stringField } from '../cli/cli-messages'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { forAgent, carryOnWords } from './carry-on-words'
import type { Owed } from './carry-ons'
import {
  isDue,
  owedFor,
  limitWait,
  shownPlan,
  mergedOwed,
  limitAcross,
  helpersAtWork,
} from './carry-ons'
import { LIMIT_REFUSAL } from './panel.constants'

/** Что продолжениям нужно от панели: вкладка по id и лимиты аккаунтов. */
export type CarryOnHost = {
  runtimeOf: (conversationId: string) => ConversationRuntime | null
  /** Лимит отказал аккаунту до этого момента (мс); null - не отказывал. */
  refusedUntil: (accountId: string) => number | null
  noteRefusal: (accountId: string, until: number | null) => void
  noteAnswered: (accountId: string) => void
}

/** Лимит, который остановил ход: состояние, при котором работа идёт, - не он. */
const STOPPED_ALLOWED = new Set(['allowed', 'allowed_warning', 'ok'])

/**
 * Продолжения оборванной работы по вкладкам (как в ACC): долги, их сроки и таймеры,
 * план на экране (Conversation.carryOn) и сами слова панели. Таймеры - в памяти: ожидание
 * перезапуск IDE не переживает, восстановленная вкладка поднимается спящей. Решения -
 * чистые функции carry-ons.ts.
 */
export class CarryOnDesk {
  private readonly owed = new Map<string, Owed>()
  /** Что панель сказала последним, пока никто не писал и ничего не прошло. */
  private readonly said = new Map<string, Owed>()
  private readonly timers = new Map<string, NodeJS.Timeout>()
  /** Последний настоящий стоп лимита по вкладке: когда сбросится (мс). */
  private readonly lastStops = new Map<string, number>()
  /** Ход этой вкладки отказал лимит: долг заводится по его итогу. */
  private readonly refusedTurns = new Set<string>()
  /** Когда вкладка последний раз слышала своих фоновых агентов. */
  private readonly helpersHeard = new Map<string, number>()

  constructor(private readonly host: CarryOnHost) {}

  /** Задолжать продолжение (складывается с тем, что уже должны). */
  owe(conversationId: string, next: Owed): void {
    const old = this.owed.get(conversationId)

    this.owed.set(conversationId, old ? mergedOwed(old, next) : next)
    this.changed(conversationId)
  }

  /**
   * «Don't continue» и Stop человека: слова снимаются; ожидание лимита остаётся тихим -
   * очередь уйдёт в момент сброса.
   */
  cancel(conversationId: string): void {
    const owed = this.owed.get(conversationId)

    this.said.delete(conversationId)

    if (owed?.reason === 'limit') this.owed.set(conversationId, { ...owed, silent: true })
    else this.owed.delete(conversationId)

    this.changed(conversationId)
  }

  /** Кто-то сказал в разговор сам (человек, очередь) или его закрыли: долг снят. */
  drop(conversationId: string): void {
    this.said.delete(conversationId)

    if (this.owed.delete(conversationId)) this.changed(conversationId)
  }

  /** Перезапуск убил фоновых агентов, которые ещё работали, - задолжать продолжение. */
  oweRestart(runtime: ConversationRuntime, now: number): void {
    const { id } = runtime.meta
    const working = runtime.feed.builder.hasBackgroundWork

    if (helpersAtWork(working, this.helpersHeard.get(id) ?? 0, now))
      this.owe(id, owedFor('restart'))
  }

  /**
   * Вкладка, которая ждёт лимит, встала на другой аккаунт: срок считается заново по нему
   * (сразу, к его сбросу или никогда). Та же подписка под другой строкой - тот же лимит.
   */
  followAccount(conversationId: string, to: string, now: number): void {
    const owed = this.owed.get(conversationId)

    if (owed?.reason !== 'limit' || owed.account === to) return

    const next = limitAcross(owed, to, this.host.refusedUntil(to), now)

    if (next) this.owed.set(conversationId, next)
    else this.owed.delete(conversationId)

    this.changed(conversationId)
  }

  /** Живая строка: стоп лимита и его сброс, отказ хода, знак фоновых агентов. */
  observe(runtime: ConversationRuntime, message: CliMessage): void {
    const { id } = runtime.meta
    const isMain = !message['parent_tool_use_id']

    if (!isMain || message['task_id'] !== undefined || message.subtype?.startsWith('task_')) {
      this.helpersHeard.set(id, Date.now())
    }

    if (message.type === 'rate_limit_event') {
      const info = recordField(message, 'rate_limit_info')
      const resetsAt = numberField(info, 'resetsAt') * 1000
      const status = stringField(info, 'status').toLowerCase()

      if (status && !STOPPED_ALLOWED.has(status) && resetsAt > 0) this.lastStops.set(id, resetsAt)
    }

    if (message.type === 'assistant' && isMain && message['error'] === LIMIT_REFUSAL) {
      this.refusedTurns.add(id)
    }
  }

  /**
   * Ход кончился (после того, как разговор отработал свой итог): лимит отказал - ждать
   * сброса; ход прошёл - отказы подряд не считаются; и сказать следующее, если должны.
   */
  afterResult(runtime: ConversationRuntime, result: CliMessage, now: number): void {
    const { id } = runtime.meta

    // Рукопожатие свежего процесса сюда не доходит: его отсеивает разговор (turn-command.ts).
    if (this.refusedTurns.delete(id)) this.noteLimitRefusal(runtime, now)
    else if (result['is_error'] !== true) {
      this.said.delete(id)
      this.host.noteAnswered(runtime.accountId)
    }

    this.sayNext(runtime, now)
  }

  /**
   * Сказать следующее, если вкладка свободна: долг, который наступил, - словами панели
   * (тихий - отпустить очередь, которую держало ожидание). Только в разговор, в котором
   * что-то было: «продолжай» в пустом отправил бы агента за работой, о которой он не слышал.
   */
  sayNext(runtime: ConversationRuntime, now: number): void {
    const { id } = runtime.meta
    const owed = this.owed.get(id)

    if (!owed || !isDue(owed, now) || runtime.isDisposed || !runtime.isFree) return

    this.owed.delete(id)
    this.changed(id)

    if (!runtime.feed.builder.items.some((item) => item.kind === 'user')) return
    if (owed.silent) return void runtime.outbox.release()

    this.said.set(id, owed)
    void runtime.send({ text: this.words(owed.reason, owed), images: [], auto: owed.reason })
  }

  /** Вкладку закрыли: её таймер и всё, что о ней слышали, уходят с ней. */
  forget(conversationId: string): void {
    this.drop(conversationId)
    clearTimeout(this.timers.get(conversationId))
    this.timers.delete(conversationId)
    this.lastStops.delete(conversationId)
    this.helpersHeard.delete(conversationId)
    this.refusedTurns.delete(conversationId)
  }

  private words(reason: CarryOnReason, owed: Owed) {
    return forAgent(reason, carryOnWords(owed))
  }

  /** Лимит отказал ходу: ждать сброса (или не ждать - дольше шести часов, три отказа подряд). */
  private noteLimitRefusal(runtime: ConversationRuntime, now: number) {
    const { id } = runtime.meta
    const account = runtime.accountId
    const stop = this.lastStops.get(id)
    const said = stop !== undefined && stop > now ? stop : null
    const known = said ?? this.host.refusedUntil(account)
    const wait = limitWait(now, known, this.said.get(id) ?? null, account)

    this.lastStops.delete(id)
    this.host.noteRefusal(account, known)

    if (wait) this.owe(id, wait)
  }

  /** Долг вкладки поменялся: таймер на его срок и план на экране. */
  private changed(conversationId: string) {
    const now = Date.now()
    const owed = this.owed.get(conversationId) ?? null
    const runtime = this.host.runtimeOf(conversationId)

    clearTimeout(this.timers.get(conversationId))
    this.timers.delete(conversationId)

    if (owed?.notBefore && owed.notBefore > now) {
      const due = owed.notBefore
      const timer = setTimeout(() => {
        const target = this.host.runtimeOf(conversationId)

        // В момент, на который ставили: таймер, пришедший на волосок раньше, нашёл бы «рано».
        if (target) this.sayNext(target, due)
        else this.forget(conversationId)
      }, due - now)

      timer.unref()
      this.timers.set(conversationId, timer)
    }

    const plan = shownPlan(owed, now)
    const shown = runtime?.meta.carryOn

    if (runtime && (shown?.until !== plan?.until || shown?.guess !== plan?.guess)) {
      runtime.update({ carryOn: plan })
    }
  }

  /** Вкладки, чей долг наступил: минутный круг панели говорит, если таймера не было. */
  due(now: number): string[] {
    return [...this.owed].filter(([, owed]) => isDue(owed, now)).map(([id]) => id)
  }
}
