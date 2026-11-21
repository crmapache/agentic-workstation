import type { ClosedReason } from '@shared/conversation-feed'

import type { ConversationRuntime } from './conversation-runtime'
import { IDLE_SLEEP_MS } from './conversation.constants'

/**
 * Когда гасить сессию разговора, не закрывая его: перезапуск (конфиг MCP или аккаунт
 * поменялся, а CLI читает их только на старте) и сон после простоя. Оба ждут свободы:
 * ход, вопросы, откат, фоновые агенты, команды и будильник агента не рвутся. Новая сессия
 * поднимется на следующее сообщение, продолжив разговор.
 */
export class SessionRecycle {
  /** Конфиг MCP или аккаунт поменялся: сессия перезапустится, как только освободится. */
  private restartPending = false
  private idleTimer: NodeJS.Timeout | null = null

  constructor(private readonly runtime: ConversationRuntime) {}

  restart(): void {
    this.restartPending = true
    this.applyPending()
  }

  /**
   * Перезапуск, который ждал свободы. Зовут везде, где разговор освобождается, и перед
   * новым ходом: иначе ход ушёл бы в старую сессию - на прежнем аккаунте. Фоновая команда и
   * будильник - тоже работа: агент кончил ход и ждёт отчёта или пробуждения, а перезапуск убил
   * бы их вместе с процессом CLI, и разговор ждал бы того, что уже не придёт. Не ждёт фона
   * только переезд на другой аккаунт - он гасит сессию сам (stopNow) и велит агенту продолжить.
   */
  applyPending(): void {
    const { runtime } = this
    const isBusy = !runtime.isFree || runtime.rewinding || this.hasBackground

    if (!this.restartPending || isBusy) return

    const session = runtime.session

    this.restartPending = false
    runtime.session = null

    // Выход заменённой сессии сюда уже не дойдёт (она больше не наша): фон закрывается
    // здесь, иначе учёт команд держал бы следующую сессию без сна навсегда.
    if (session) {
      runtime.feed.builder.abortBackground('restarted')
      runtime.feed.flush()
    }

    void session?.stop()
  }

  /**
   * Погасить сессию сейчас, не дожидаясь фона (переезд на другой аккаунт): фоновые агенты и
   * команды гибнут с процессом, и лента называет причину reason, а не голый выход. Вопросы
   * и ход снимает выход сессии, как всегда. Сбывается, когда процесс закрылся.
   */
  stopNow(reason: ClosedReason): Promise<void> {
    const { session, feed } = this.runtime

    if (!session) return Promise.resolve()

    feed.builder.abortBackground(reason)
    feed.flush()

    return session.stop()
  }

  /**
   * Сон сессии после простоя. Фоновые агенты, флот workflow, фоновые команды и будильник -
   * работа этой сессии: вкладка выглядит простаивающей, а сон убил бы их молча.
   */
  scheduleSleep(): void {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => {
      const { runtime } = this
      // Очередь, которая ждёт человека, - не работа: сессия может уснуть.
      const hasOutgoing = runtime.meta.queue.length > 0 && !runtime.outbox.isHeld

      if (!runtime.isFree || hasOutgoing || this.hasBackground) return this.scheduleSleep()

      const session = runtime.session

      runtime.session = null
      void session?.stop()
    }, IDLE_SLEEP_MS)
    this.idleTimer.unref()
  }

  clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)

    this.idleTimer = null
  }

  /** Фон сессии: агенты, флоты workflow, команды, будильник. Он умирает с процессом CLI. */
  private get hasBackground(): boolean {
    const { builder } = this.runtime.feed

    return builder.hasBackgroundWork || builder.hasBackgroundCommands || builder.hasWakeup
  }
}
