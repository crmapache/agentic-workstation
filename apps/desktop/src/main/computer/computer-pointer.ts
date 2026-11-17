import { isApart } from './computer-geometry'
import { POINTER_WATCH_MS, POINTER_MOTION_GRACE_MS } from './computer.constants'
import type { Point, InputDriver, SystemCursor } from './computer.types'

/** Окно со стрелкой ИИ: показать в точке, вести, круг нажатия, убрать. */
export type PointerMark = {
  show: (at: Point) => void
  moveTo: (at: Point) => void
  press: () => void
  hide: () => void
}

/** Часы стрелки: живые - у IDE, свои - в тестах. */
export type PointerClock = {
  now: () => number
  setInterval: (run: () => void, ms: number) => unknown
  clearInterval: (timer: unknown) => void
}

export type PointerPort = {
  /** Где курсор сейчас; не узнать (экран блокировки Windows) - бросает. */
  cursor: () => Point
  system: SystemCursor
  mark: PointerMark
  clock?: PointerClock | undefined
}

const LIVE_CLOCK: PointerClock = {
  now: () => performance.now(),
  setInterval: (run, ms) => setInterval(run, ms),
  clearInterval: (timer) => clearInterval(timer as ReturnType<typeof setInterval>),
}

/**
 * Стрелка ИИ Computer Use (ADR 0079): пока ИИ держит мышь, системная стрелка спрятана, а вместо
 * неё своя, стального синего, - там, куда рука ставит курсор. Мышь взял человек (курсор ушёл не
 * рукой) - сразу его системная стрелка, а синяя возвращается со следующим шагом руки. Пауза,
 * Stop и конец работы - тоже системная. Система не дала спрятать стрелку - синей нет вовсе:
 * две стрелки сразу хуже ни одной своей.
 */
export class ComputerPointer {
  private readonly clock: PointerClock
  /** Стол держит компьютер, и не на паузе. */
  private isActive = false
  /** Последней мышь двигала рука ИИ, а не человек. */
  private isHandLast = false
  /** Система отказалась прятать стрелку - до следующего раза, когда ИИ возьмёт мышь. */
  private isRefused = false
  private isShown = false
  /** Куда рука поставила курсор последним и предпоследним: система догоняет с задержкой. */
  private placed: Point | null = null
  private previous: Point | null = null
  private movedAt = Number.NEGATIVE_INFINITY
  private watch: unknown = null

  constructor(private readonly port: PointerPort) {
    this.clock = port.clock ?? LIVE_CLOCK
  }

  /**
   * Стол взял компьютер или отпустил его; пауза - тоже отпустил. Взял - мышь его там, где она
   * сейчас: стрелка синеет на месте, ещё до первого шага руки.
   */
  setActive(isActive: boolean): void {
    if (isActive === this.isActive) return

    this.isActive = isActive

    if (isActive) {
      this.isHandLast = true
      this.isRefused = false
      this.placed = this.read()
      this.previous = null
    }

    this.update()
  }

  /** Рука поставила курсор: событие движения ушло в систему. */
  moved(at: Point): void {
    this.previous = this.placed
    this.placed = at
    this.movedAt = this.clock.now()
    this.isHandLast = true

    if (this.isShown) this.port.mark.moveTo(at)
    else this.update()
  }

  /** Рука нажала кнопку мыши - круг от острия. */
  pressed(): void {
    if (this.isShown) this.port.mark.press()
  }

  /** IDE выходит или Computer выключен: системная стрелка возвращается. */
  dispose(): void {
    this.isActive = false
    this.update()
  }

  private update(): void {
    const isWanted = this.isActive && this.isHandLast && !this.isRefused && this.placed !== null

    if (isWanted === this.isShown) return

    if (isWanted && this.placed) {
      if (!this.port.system.hide()) {
        this.isRefused = true

        return
      }

      this.port.mark.show(this.placed)
      this.isShown = true
      this.watch = this.clock.setInterval(() => this.check(), POINTER_WATCH_MS)

      return
    }

    this.clock.clearInterval(this.watch)
    this.watch = null
    this.port.mark.hide()
    this.port.system.show()
    this.isShown = false
  }

  /**
   * Курсор не там, куда его ставила рука, - мышь взял человек. Посреди пути руки не проверять:
   * курсор там догоняет её с задержкой, это решает сама рука (ComputerHand.guard).
   */
  private check(): void {
    if (this.clock.now() - this.movedAt < POINTER_MOTION_GRACE_MS) return

    const at = this.read()
    const { placed, previous } = this

    if (!at || !placed) return

    if (isApart(at, placed) && (!previous || isApart(at, previous))) {
      this.isHandLast = false
      this.update()
    }
  }

  private read(): Point | null {
    try {
      return this.port.cursor()
    } catch {
      return null
    }
  }
}

/**
 * Ввод, о котором узнаёт стрелка ИИ: куда рука ставит курсор и где жмёт кнопку. Рука о стрелке не
 * знает - она работает с этим вводом, как с любым другим.
 */
export const withPointer = (input: InputDriver, pointer: ComputerPointer): InputDriver => ({
  ...input,
  mouse: (motion, at, button, clicks, flags) => {
    input.mouse(motion, at, button, clicks, flags)

    if (motion === 'move' || motion === 'drag') pointer.moved(at)
    else if (motion === 'down') pointer.pressed()
  },
})
