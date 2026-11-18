/** Часы работы для окна: когда работа началась и сколько из этого простояло на вопросах. */
export type WorkView = { startedAt: number | null; pausedMs: number }

/**
 * Время работы над запросом человека (в ACC - stint). Один запрос - не один ход: агент,
 * поднявший фоновых субагентов, замолкает, и каждый их отчёт поднимает ход заново. CLI
 * знает только ход, поэтому подпись «Worked» под ответом считает панель: от сообщения
 * человека (или хода, поднятого без нас) до момента, когда работа встала - нет хода и
 * фоновых агентов. Время на вопросах человеку (разрешение, план) вычитается.
 */
export class WorkClock {
  private startedAt: number | null = null
  private pausedMs = 0
  private pausedAt: number | null = null

  /** Работа началась (сообщение человека, ход без нас); уже идёт - ничего. */
  begin(at: number): void {
    if (this.startedAt !== null) return

    this.startedAt = at
    this.pausedMs = 0
    this.pausedAt = null
  }

  /** Ход стоит на вопросе к человеку: это время работе не принадлежит. */
  pause(at: number): void {
    if (this.startedAt !== null && this.pausedAt === null) this.pausedAt = at
  }

  resume(at: number): void {
    if (this.pausedAt === null) return

    this.pausedMs += Math.max(0, at - this.pausedAt)
    this.pausedAt = null
  }

  /** Сколько шла работа к моменту at без пауз; null - работы нет. */
  elapsed(at: number): number | null {
    if (this.startedAt === null) return null

    const paused = this.pausedMs + (this.pausedAt === null ? 0 : Math.max(0, at - this.pausedAt))

    return Math.max(0, at - this.startedAt - paused)
  }

  /** Работа встала: следующее сообщение начнёт счёт заново. */
  end(): void {
    this.startedAt = null
    this.pausedMs = 0
    this.pausedAt = null
  }

  /** Для живого счётчика в строке статуса: начало и уже закрытые паузы. */
  get view(): WorkView {
    return { startedAt: this.startedAt, pausedMs: this.pausedMs }
  }
}

/**
 * Часы работы по статусу разговора: вопрос к человеку - пауза, ход снова идёт - пауза
 * кончилась, нет ни хода, ни фоновых агентов - работа встала. Ответ - поля вкладки для
 * живого счётчика в окне.
 */
export const syncWork = (
  clock: WorkClock,
  status: 'idle' | 'running' | 'waiting',
  hasBackgroundWork: boolean,
  at: number,
): { workStartedAt: number | null; workPausedMs: number } => {
  if (status === 'waiting') clock.pause(at)
  else clock.resume(at)

  if (status === 'idle' && !hasBackgroundWork) clock.end()

  const { startedAt, pausedMs } = clock.view

  return { workStartedAt: startedAt, workPausedMs: pausedMs }
}
