import { claudeOf } from '../conversation/claude-conversation'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import type { CarryOnDesk } from './carry-on-desk'
import { owedFor } from './carry-ons'
import { FORCED_MOVE_MS } from './panel.constants'

/** Что переездам нужно от панели: вкладки, аккаунт в работе и продолжения. */
export type MovesHost = {
  runtimes: () => ConversationRuntime[]
  currentAccount: () => string
  carryOn: CarryOnDesk
}

/**
 * Переезд разговоров на выбранный аккаунт (как в ACC): Select переводит ВСЁ. CLI читает
 * вход один раз, при старте, поэтому переезд - новый процесс над тем же транскриптом.
 * Идущий ход прерывается (иначе минуты оплачивала бы покинутая подписка), переезд - по
 * его концу, а упрямый процесс через 8 секунд снимается; потом панель продолжает сама.
 * Простаивающая вкладка с фоновыми агентами или командами меняется сразу - и продолжает:
 * фон погиб с процессом, агент запустит заново то, что ему ещё нужно. Та же подписка под
 * другой строкой (склейка дублей) ход не рвёт.
 */
export class AccountMoves {
  /** Вкладки, чей ход прерван ради переезда: id → срок, после которого процесс снимут. */
  private readonly forced = new Map<string, NodeJS.Timeout>()
  /** Смена идёт на ту же подписку: ход доживает, процессы сменятся, как освободятся. */
  private gentle = false

  constructor(private readonly host: MovesHost) {}

  /** Аккаунт в работе сменился (или Select по нему же): перевести всё, что не на нём. */
  followCurrent(): void {
    const current = this.host.currentAccount()
    const now = Date.now()

    for (const runtime of this.host.runtimes()) {
      const { id } = runtime.meta
      const process = claudeOf(runtime).process?.isAlive ? claudeOf(runtime).process : null

      // Ожидание лимита считается заново по аккаунту, на который вкладка встанет.
      this.host.carryOn.followAccount(id, current, now)

      if (!process || runtime.accountId === current) {
        this.host.carryOn.sayNext(runtime, now)
        continue
      }

      // Свободная вкладка меняет процесс сразу, занятая - как освободится.
      runtime.restartSession()

      if (this.gentle || this.forced.has(id)) continue

      const { builder } = claudeOf(runtime).feed

      if (runtime.turnActive) this.interrupt(runtime)
      else if (builder.hasBackgroundWork || builder.hasBackgroundCommands) {
        this.swapQuietly(runtime, now)
      } else this.host.carryOn.sayNext(runtime, now)
    }
  }

  /** Сменить аккаунт, не прерывая ход: та же подписка, отнимать ответ не за что. */
  async gently(change: () => Promise<void> | void): Promise<void> {
    this.gentle = true

    try {
      await change()
    } finally {
      this.gentle = false
    }
  }

  /**
   * Ход кончился: вкладка, прерванная ради переезда, ещё на старом процессе (держали
   * фоновые агенты или команды) - снять его. Слова продолжения скажут и про фон.
   */
  afterTurn(runtime: ConversationRuntime): Promise<void> {
    const timer = this.forced.get(runtime.meta.id)

    clearTimeout(timer)
    this.forced.delete(runtime.meta.id)

    const process = claudeOf(runtime).process

    return process && timer && runtime.accountId !== this.host.currentAccount()
      ? runtime.stopNow('restarted')
      : Promise.resolve()
  }

  /** Прервать ход ради переезда и продолжить на новом аккаунте; не остановился - снять. */
  private interrupt(runtime: ConversationRuntime) {
    const { id } = runtime.meta
    const process = claudeOf(runtime).process

    this.host.carryOn.owe(id, owedFor('accountSwitch'))
    // Итог хода скажет «Stopped to switch account», а не «Stopped by you» (как в ACC).
    runtime.interrupt('account')

    const timer = setTimeout(() => {
      this.forced.delete(id)

      if (claudeOf(runtime).process !== process || !runtime.turnActive) return

      // Процесс снят посреди хода: его выход сам закроет ход, а продолжение - после.
      void process?.stop().then(() => this.host.carryOn.sayNext(runtime, Date.now()))
    }, FORCED_MOVE_MS)

    timer.unref()
    this.forced.set(id, timer)
  }

  /**
   * Простаивающая вкладка с фоновыми агентами или командами: процесс меняется сейчас, фон
   * гибнет с ним - лента называет причину, и если он ещё работал, панель говорит агенту
   * продолжить. Долг - до остановки: она снимает учёт фона.
   */
  private swapQuietly(runtime: ConversationRuntime, now: number) {
    this.host.carryOn.oweRestart(runtime, now)
    void runtime.stopNow('restarted').then(() => this.host.carryOn.sayNext(runtime, Date.now()))
  }
}
