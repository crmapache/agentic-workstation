import type { CapsuleView, CapsuleActivity } from '@shared/computer'

import { abortReason, ComputerError, asComputerError } from './computer-error'
import { HOLD_IDLE_MS, PAUSE_WAIT_MAX_MS } from './computer.constants'

/** Шаг вызова для строки капсулы: слова модели о нём или само действие. */
export type DeskStep = Exclude<CapsuleActivity, { kind: 'said' }>

/**
 * Чей вызов: ключ разговора (его процесса без разговора), подпись разговора для отказа «занято»
 * (проект) и шаг для строки капсулы.
 */
export type DeskCall = {
  key: string
  label: string
  step: DeskStep
  signal: AbortSignal | undefined
}

/**
 * Работа от имени разговора: сигнал обрыва и сколько вызов простоял на паузе человека - за это
 * время экран мог поменяться, и модели стоит это знать.
 */
export type DeskWork<T> = (signal: AbortSignal, pausedMs: number) => Promise<T>

type Holder = { key: string; label: string }

const PAUSED =
  'The user pressed Pause, so this action stopped partway. Your next computer call waits ' +
  'until they press Resume; take a screenshot then - the screen may have changed.'

const STOPPED =
  'The user pressed Stop: computer use ended. Ask the user before using the computer again.'

const STILL_PAUSED =
  'The user paused computer use and has not resumed for a long time. Ask them whether to go on.'

const ENDED = 'This conversation process has ended.'

const TURNED_OFF = 'Computer Use was turned off.'

const busy = (label: string) =>
  `Another conversation (${label}) is using the computer right now: there is one mouse. Wait ` +
  'for it to finish, or ask the user.'

/** Таймеры стола: живые - у IDE, свои - в тестах. */
export type DeskClock = {
  setTimeout: (run: () => void, ms: number) => unknown
  clearTimeout: (timer: unknown) => void
}

const LIVE_CLOCK: DeskClock = {
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}

/**
 * Компьютер один, мышь одна (ADR 0057): его держит один разговор за раз, вызовы идут по
 * одному. Держит, пока работает: минуту без вызовов - отпускает, и капсула гаснет. Человек в
 * капсуле ставит паузу (идущее действие обрывается, следующий вызов ждёт продолжения) и
 * останавливает (разговор узнаёт об этом и больше компьютер не берёт, пока его не попросят).
 *
 * У каждого вызова свой билет: остановка, конец разговора и выключение коннектора обрывают
 * билеты сразу - и идущий вызов, и ждущий паузы, и стоящий в очереди. Иначе разбуженный вызов
 * пошёл бы работать уже без капсулы, и остановить его было бы нечем.
 */
export class ComputerDesk {
  private holder: Holder | null = null
  private isPaused = false
  private isWorking = false
  /** Шаг, который идёт, - строка капсулы, пока рука действует. */
  private step: DeskStep | null = null
  /** Последняя законченная фраза модели после шага - строка капсулы, пока она думает. */
  private said: string | null = null
  /** Сколько раз ставили паузу: снимок, сделанный до паузы, - уже не правда об экране. */
  private pauseCount = 0
  private action: AbortController | null = null
  private tickets = new Map<AbortController, string>()
  private waiters = new Set<() => void>()
  /** Что сказать разговору на следующем вызове вместо ответа: Stop между вызовами. */
  private notices = new Map<string, string>()
  private idle: unknown = null
  private tail: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly onView: (view: CapsuleView | null) => void,
    private readonly clock: DeskClock = LIVE_CLOCK,
  ) {}

  /**
   * Что показывает капсула; компьютер свободен - null. Действует - шаг, думает - его последняя
   * фраза после шага (нет - только состояние), на паузе - только состояние.
   */
  view(): CapsuleView | null {
    if (!this.holder) return null

    if (this.isPaused) return { state: 'paused', activity: null }

    if (this.isWorking) return { state: 'working', activity: this.step }

    return { state: 'ready', activity: this.said ? { kind: 'said', text: this.said } : null }
  }

  /**
   * Модель разговора сказала фразу (лента его ответа): капсула покажет её, пока модель думает
   * до следующего шага. Чужой разговор или та же фраза - ничего не меняется.
   */
  heard(key: string, text: string): void {
    if (this.holder?.key !== key || this.said === text) return

    this.said = text
    this.changed()
  }

  /** Чей разговор держит компьютер (ключ вызова); свободен - null. */
  get holding(): string | null {
    return this.holder?.key ?? null
  }

  /** Сколько раз человек ставил паузу - по нему агент узнаёт снимки, сделанные до неё. */
  get pauses(): number {
    return this.pauseCount
  }

  /**
   * Сделать работу от имени разговора: по очереди с другими вызовами, при паузе - дождаться
   * продолжения. Сигнал работы обрывается отменой вызова, паузой, остановкой и концом
   * разговора - с причиной.
   */
  async run<T>(call: DeskCall, work: DeskWork<T>): Promise<T> {
    this.admit(call)

    const ticket = new AbortController()
    const signal = call.signal ? AbortSignal.any([call.signal, ticket.signal]) : ticket.signal
    const turn = this.tail.then(() => this.runNow(call, signal, work))

    this.tickets.set(ticket, call.key)
    this.tail = turn.catch(() => undefined)

    try {
      return await turn
    } finally {
      this.tickets.delete(ticket)
    }
  }

  pause(): void {
    if (!this.holder || this.isPaused) return

    this.isPaused = true
    this.pauseCount += 1
    this.clock.clearTimeout(this.idle)
    this.action?.abort(abortReason('paused', PAUSED))
    this.changed()
  }

  resume(): void {
    if (!this.isPaused) return

    this.isPaused = false
    this.wake()
    this.armIdle()
    this.changed()
  }

  /**
   * Остановка человеком. Идущий или ждущий вызов узнаёт о ней сам; если разговор был между
   * вызовами - узнает следующий, один раз. Компьютер свободен.
   */
  stop(): void {
    if (!this.holder) return

    const { key } = this.holder

    if (!this.hasCalls(key)) this.notices.set(key, STOPPED)

    this.cut(key, abortReason('stopped', STOPPED))
    this.free()
  }

  /** Процесс разговора кончился: его вызовы обрываются, компьютер он больше не держит. */
  release(key: string): void {
    this.cut(key, abortReason('cancelled', ENDED))

    if (this.holder?.key === key) this.free()
  }

  endConversation(key: string): void {
    this.notices.delete(key)
    this.release(key)
  }

  /** Коннектор выключили или IDE выходит: всё обрывается молча. */
  dispose(): void {
    this.cut(null, abortReason('cancelled', TURNED_OFF))
    this.notices.clear()
    this.free()
  }

  /** Сразу при вызове и в его очередь: остановленному - его новость, чужому - «занято». */
  private admit(call: DeskCall): void {
    const notice = this.notices.get(call.key)

    if (notice) {
      this.notices.delete(call.key)
      throw new ComputerError('stopped', notice)
    }

    if (this.holder && this.holder.key !== call.key) {
      throw new ComputerError('busy', busy(this.holder.label))
    }
  }

  private async runNow<T>(call: DeskCall, signal: AbortSignal, work: DeskWork<T>): Promise<T> {
    // Пока вызов ждал очереди, его могли оборвать, компьютер мог взять другой разговор.
    if (signal.aborted) throw asComputerError(signal)

    this.admit(call)
    this.holder = { key: call.key, label: call.label }
    this.clock.clearTimeout(this.idle)
    this.changed()

    const pausedFrom = Date.now()
    let pausedMs = 0

    if (this.isPaused) {
      // Пауза могла прийти снова, пока вызов ждал продолжения.
      while (this.isPaused) await this.whilePaused(signal)

      pausedMs = Date.now() - pausedFrom
    }

    // Разбудила не кнопка Resume, а остановка или конец разговора.
    if (signal.aborted) throw asComputerError(signal)

    const action = new AbortController()
    const working = AbortSignal.any([signal, action.signal])

    this.action = action
    this.isWorking = true
    this.step = call.step
    // Фраза была про этот шаг: после него модель думает заново, и старая уже не про то.
    this.said = null
    this.changed()

    try {
      return await work(working, pausedMs)
    } catch (error) {
      throw working.aborted ? asComputerError(working) : error
    } finally {
      this.action = null
      this.isWorking = false
      this.step = null

      if (this.holder?.key === call.key) this.armIdle()

      this.changed()
    }
  }

  /**
   * Ждать продолжения. Обрыв вызова (отмена, остановка) и потолок паузы - отказ со своей
   * причиной; уборка подписок - одна на все исходы.
   */
  private whilePaused(signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.waiters.delete(resumed)
        this.clock.clearTimeout(timer)
        signal.removeEventListener('abort', aborted)
      }
      const resumed = () => {
        cleanup()
        resolve()
      }
      const aborted = () => {
        cleanup()
        reject(asComputerError(signal))
      }
      const timer = this.clock.setTimeout(() => {
        cleanup()
        reject(new ComputerError('paused', STILL_PAUSED))
      }, PAUSE_WAIT_MAX_MS)

      if (signal.aborted) return aborted()

      this.waiters.add(resumed)
      signal.addEventListener('abort', aborted, { once: true })
    })
  }

  private hasCalls(key: string): boolean {
    return [...this.tickets.values()].includes(key)
  }

  /** Оборвать билеты разговора (null - всех) с причиной: идущие, ждущие и в очереди. */
  private cut(key: string | null, reason: ComputerError): void {
    for (const [ticket, owner] of this.tickets) {
      if (key === null || owner === key) ticket.abort(reason)
    }
  }

  private wake(): void {
    for (const resumed of [...this.waiters]) resumed()
  }

  private free(): void {
    this.holder = null
    this.isPaused = false
    this.step = null
    this.said = null
    this.clock.clearTimeout(this.idle)
    this.wake()
    this.changed()
  }

  private armIdle(): void {
    this.clock.clearTimeout(this.idle)

    if (this.isPaused) return

    this.idle = this.clock.setTimeout(() => {
      if (!this.isWorking && !this.isPaused) this.free()
    }, HOLD_IDLE_MS)
  }

  private changed(): void {
    this.onView(this.view())
  }
}
