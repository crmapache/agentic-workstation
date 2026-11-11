import type { TerminalReplay } from '@shared/terminal'

import { REPLAY_SLACK, REPLAY_LINE_REACH } from './terminal.constants'

/**
 * Хвост вывода сессии и счёт всего выведенного. Хвост отдаётся окну, которое подключилось к
 * живой оболочке (перезагрузка), счёт - чтобы оно отбросило куски, уже вошедшие в хвост.
 */
export class OutputLog {
  private chunks: string[] = []
  private size = 0
  private total = 0

  constructor(private readonly limit: number) {}

  /** Сколько знаков сессия вывела за всю жизнь. */
  get end(): number {
    return this.total
  }

  append(data: string): void {
    this.chunks.push(data)
    this.size += data.length
    this.total += data.length

    if (this.size > this.limit * REPLAY_SLACK) this.trim()
  }

  snapshot(): TerminalReplay {
    const data = this.chunks.join('')

    this.chunks = data ? [data] : []

    return { data, end: this.total }
  }

  /** До предела, с начала строки, если перевод строки недалеко от места реза. */
  private trim(): void {
    const whole = this.chunks.join('')
    const cut = whole.length - this.limit
    // Начало первой целой строки не раньше места реза: перевод строки - на шаг до него.
    const newline = whole.indexOf('\n', cut - 1)
    const start = newline >= 0 && newline - cut < REPLAY_LINE_REACH ? newline + 1 : cut
    const kept = whole.slice(start)

    this.chunks = [kept]
    this.size = kept.length
  }
}
