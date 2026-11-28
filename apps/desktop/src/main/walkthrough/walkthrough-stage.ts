import type {
  MarkBox,
  MarkPoint,
  WalkthroughLit,
  WalkthroughPen,
  WalkthroughStroke,
  WalkthroughPanelView,
} from '@shared/walkthrough'

import type { Rect, Display } from '../computer/computer-geometry'
import { windowsChangedAt } from '../computer/computer-seen'
import type { Glance } from '../computer/computer-seen'
import type { Timer } from '../voice/call/utterances'
import { isDrawn, boxAnchors, strokeAnchors } from './walkthrough-marks'

/** Что рисует окно меток: в точках окна (origin - его левый верхний угол на экране). */
export type StageDrawing = { lit: WalkthroughLit[]; strokes: WalkthroughStroke[] }

/** Окна показа: метки во весь дисплей и панель инструментов человека сбоку. */
export type StageWindows = {
  marks: {
    show: (
      area: Rect,
      draw: (origin: MarkPoint) => StageDrawing,
      pen: WalkthroughPen | null,
    ) => void
    hide: () => void
  }
  panel: { show: (display: Display, view: WalkthroughPanelView) => void; hide: () => void }
}

export type StagePorts = {
  windows: StageWindows
  /** Окна экрана сейчас: подсветка и пометка уходят, когда окно под ними уехало. */
  glance: () => Glance
  /** Дисплей под мышью: там человек смотрит, когда показ начался. */
  displayAtCursor: () => Display | null
  timer: Timer
  now: () => number
}

/**
 * Пометка человека в точках экрана: сказал ли он о ней уже модели (told - реплика ушла с её
 * числом) и посмотрела ли модель на неё (seen - user_marks). Рассказанную, но не увиденную пометку
 * действие ИИ не стирает: модель должна сначала понять, на что показал человек.
 */
export type ScreenStroke = {
  id: number
  pen: WalkthroughPen
  points: MarkPoint[]
  told: boolean
  seen: boolean
}

type Lit = { box: MarkBox; glance: Glance }

type Stroke = ScreenStroke & { glance: Glance }

/** Как часто сверять окна под подсветкой и пометками. */
const WATCH_MS = 500

/** Дольше этого инструмент в руке без дела ИИ не держит: забыт - ИИ идёт дальше. */
export const USER_HOLD_MAX_MS = 3 * 60_000

/**
 * Столько после последней пометки (или отложенного инструмента) ИИ ждёт слов о ней: действие
 * стёрло бы её раньше, чем человек скажет, о чём она, а молчание на вопрос стало бы «да».
 * Промолчал дольше - ИИ идёт дальше.
 */
export const FRESH_MARKS_HOLD_MS = 15_000

/**
 * Сцена показа Walkthrough (ADR 0135): что сейчас на экране и в чьём показе. Подсветки модели -
 * вырезы в затемнении, пометки человека - его рисунок поверх, инструмент в руке - окно меток
 * ловит мышь. Всё на одном дисплее: там же панель инструментов. Подсветка на другом дисплее
 * переносит туда сцену, пометки остаются на прежнем экране - они про него.
 */
export class WalkthroughStage {
  private owner: string | null = null
  private display: Display | null = null
  private lit: Lit[] = []
  private strokes: Stroke[] = []
  private pen: WalkthroughPen | null = null
  private nextId = 0
  /** Когда человек последний раз брал, откладывал инструмент или рисовал. */
  private penAt = 0
  private stopWatch: (() => void) | null = null

  constructor(private readonly ports: StagePorts) {}

  /** Чей показ на сцене; нет показа - null. */
  get conversation(): string | null {
    return this.owner
  }

  /** Человек держит инструмент: ИИ ждёт, пока он его отложит. */
  get inHand(): boolean {
    return this.pen !== null
  }

  /**
   * Человек сейчас показывает сам: держит инструмент или только что нарисовал и ещё не сказал, о
   * чём (FRESH_MARKS_HOLD_MS). ИИ ждёт его, а тишина на вопрос не считается молчанием.
   */
  get isDrawing(): boolean {
    const since = this.ports.now() - this.penAt
    const hasFresh = this.strokes.some((stroke) => !stroke.told)

    return (
      (this.pen !== null && since < USER_HOLD_MAX_MS) || (hasFresh && since < FRESH_MARKS_HOLD_MS)
    )
  }

  /** Сколько пометок человек рассказал модели, а она их ещё не видела. */
  get unseen(): number {
    return this.strokes.filter((stroke) => stroke.told && !stroke.seen).length
  }

  /** Модель узнала о пометках (отказ действия сказал ей посмотреть): больше не держат действие. */
  markSeen(): void {
    this.strokes = this.strokes.map((stroke) => ({ ...stroke, seen: stroke.seen || stroke.told }))
  }

  /** Показ начался: панель встаёт на дисплей, куда смотрит человек. */
  open(conversationId: string): void {
    this.owner = conversationId
    this.display = this.ports.displayAtCursor()
    this.render()
  }

  /** Показ кончился: метки, инструмент и панель уходят. */
  close(): void {
    this.owner = null
    this.pen = null
    this.lit = []
    this.strokes = []
    this.render()
    this.ports.windows.panel.hide()
  }

  /**
   * Подсветить область (в точках экрана) на дисплее снимка модели. keep - рядом с прежними, иначе
   * вместо них; пометки человека, которые модель уже видела, уходят вместе с прежней подсветкой.
   */
  light(display: Display, box: MarkBox, glance: Glance, keep: boolean): void {
    if (!this.owner) return

    if (this.display?.id !== display.id) {
      this.display = display
      this.lit = []
      this.strokes = []
    }

    if (!keep) {
      this.lit = []
      this.strokes = this.strokes.filter((stroke) => !stroke.seen)
    }

    this.lit = [...this.lit, { box, glance }]
    this.render()
  }

  /** Стереть подсветку и пометки: экран сейчас поменяется или модель так решила. */
  wipe(): void {
    if (this.lit.length === 0 && this.strokes.length === 0) return

    this.lit = []
    this.strokes = []
    this.render()
  }

  /** Человек взял инструмент на панели; тот же ещё раз или null - отложил. */
  pick(pen: WalkthroughPen | null): WalkthroughPanelView {
    if (this.owner) this.pen = pen === this.pen ? null : pen

    this.penAt = this.ports.now()
    this.render()

    return this.panelView()
  }

  /** Человек нарисовал пометку (точки экрана). Случайный щелчок - не пометка. */
  draw(pen: WalkthroughPen, points: MarkPoint[]): void {
    if (!this.owner || this.pen !== pen || !isDrawn(points)) return

    this.nextId += 1
    this.penAt = this.ports.now()
    this.strokes = [
      ...this.strokes,
      { id: this.nextId, pen, points, told: false, seen: false, glance: this.ports.glance() },
    ]
    this.render()
  }

  /** Кнопка «стереть» на панели: пометки человека уходят, подсветка модели остаётся. */
  erase(): WalkthroughPanelView {
    this.strokes = []
    this.render()

    return this.panelView()
  }

  /**
   * Сколько пометок человек нарисовал с прошлого раза - модели о них скажут с его репликой. Раз
   * он о них сказал, инструмент больше не нужен: откладывается, мышь снова у приложений.
   */
  takeDrawn(): number {
    const fresh = this.strokes.filter((stroke) => !stroke.told)

    if (fresh.length === 0) return 0

    this.strokes = this.strokes.map((stroke) => ({ ...stroke, told: true }))
    this.pen = null
    this.render()

    return fresh.length
  }

  /** Модель смотрит пометки человека (user_marks): они и их дисплей; теперь они увидены. */
  lookAt(): { display: Display; strokes: ScreenStroke[] } | null {
    if (!this.display || this.strokes.length === 0) return null

    const strokes = this.strokes.map(({ id, pen, points, told }) => ({
      id,
      pen,
      points,
      told,
      seen: true,
    }))

    this.strokes = this.strokes.map((stroke) => ({ ...stroke, seen: true }))

    return { display: this.display, strokes }
  }

  panelView(): WalkthroughPanelView {
    return { pen: this.pen, hasStrokes: this.strokes.length > 0 }
  }

  private render(): void {
    const { windows } = this.ports
    const { display } = this

    if (this.owner && display) windows.panel.show(display, this.panelView())

    if (!display || (this.lit.length === 0 && this.strokes.length === 0 && !this.pen)) {
      this.stopWatching()
      windows.marks.hide()

      return
    }

    windows.marks.show(display.bounds, (origin) => this.drawing(origin), this.pen)
    this.watch()
  }

  private drawing(origin: MarkPoint): StageDrawing {
    const local = (point: MarkPoint): MarkPoint => ({
      x: point.x - origin.x,
      y: point.y - origin.y,
    })

    return {
      lit: this.lit.map(({ box }, slot) => ({ slot, box: { ...box, ...local(box) } })),
      strokes: this.strokes.map(({ id, pen, points }) => ({ id, pen, points: points.map(local) })),
    }
  }

  /** Сверять окна под подсветкой и пометками, пока они на экране: окно уехало - стереть. */
  private watch(): void {
    if (this.stopWatch) return

    const tick = () => {
      this.stopWatch = null

      const now = this.ports.glance()
      const moved = [
        ...this.lit.map(({ box, glance }) => ({ glance, anchors: boxAnchors(box) })),
        ...this.strokes.map(({ pen, points, glance }) => ({
          glance,
          anchors: strokeAnchors(pen, points),
        })),
      ].some(({ glance, anchors }) => windowsChangedAt(glance, now, anchors) !== null)

      if (moved) this.wipe()
      else if (this.lit.length > 0 || this.strokes.length > 0) {
        this.stopWatch = this.ports.timer(tick, WATCH_MS)
      }
    }

    this.stopWatch = this.ports.timer(tick, WATCH_MS)
  }

  private stopWatching(): void {
    this.stopWatch?.()
    this.stopWatch = null
  }
}
