import type { ComputerState, ComputerPermission } from '@shared/computer'

import { isMultiline } from '../browser/typed-lines'
import { assertComputerAccess } from './computer-access'
import { openApp } from './computer-apps'
import type { DeskCall, ComputerDesk } from './computer-desk'
import { ComputerError } from './computer-error'
import { toShot, regionOf, toScreen, displayAt } from './computer-geometry'
import type { Display, ShotFrame } from './computer-geometry'
import { LIVE_MOTION } from './computer-hand'
import type { ComputerHand } from './computer-hand'
import type { KeyChord } from './computer-keys'
import { shootRegion, listDisplays, shootDisplay } from './computer-screen'
import type { Picture } from './computer-screen'
import {
  glance,
  outdated,
  LOOK_AGAIN,
  SHOOT_AGAIN,
  changedSince,
  isTouchedSince,
  windowsChangedAt,
} from './computer-seen'
import type { Seen, Glance } from './computer-seen'
import { SETTLE_AFTER_OPEN_MS, SETTLE_AFTER_ACTION_MS } from './computer.constants'
import type { Point, MouseButton } from './computer.types'
import { clickedText } from './screen-element'
import type { ScreenWitness } from './screen-scene'

/**
 * Ответ инструмента: картинка экрана и что про неё знать. isRefusal - действие не сделано
 * проверкой (ADR 0119): модель получает и снимок, и отказ.
 */
export type ComputerAnswer = { picture: Picture; text: string; isRefusal?: boolean }

/**
 * Куда ложится метка показа Walkthrough (ADR 0134): дисплей последнего снимка и перевод его
 * пикселей в точки экрана, а снимок не годится - почему (refusal), словами для модели.
 */
export type Aim = { display: Display; toScreen: (pixel: Point) => Point } | { refusal: string }

/** Что агенту нужно от IDE: стол, рука, разрешения, капсула (пропускать клики сквозь себя). */
export type ComputerPort = {
  desk: ComputerDesk
  hand: ComputerHand
  access: () => ComputerState
  /**
   * Пропускать клики сквозь капсулу к приложению под ней. Только пока рука бьёт в точку под
   * капсулой (covers): всё остальное время её Pause и Stop ловят человека и посреди действия.
   */
  passThrough: (isOn: boolean) => void
  /** Лежит ли точка экрана под капсулой. */
  covers: (point: Point) => boolean
  /** Снять экран так, чтобы капсулы на снимке не было (старый Windows 10 её не исключает). */
  hiddenFromShot: <T>(shoot: () => Promise<T>) => Promise<T>
  /** Окна экрана и время последнего ввода: сверка экрана перед действием (ADR 0129). */
  witness: ScreenWitness
  /**
   * Разговор кончил работу, в которой брал компьютер, и человек после последнего снимка ИИ
   * компьютер не трогал: IDE возвращает его к чату (ADR 0130).
   */
  finished: (key: string) => void
  /**
   * Перед каждым действием (ADR 0134): показ Walkthrough ждёт, пока прозвучат слова модели перед
   * действием, и стирает метки - экран сейчас поменяется. Нет - действие идёт сразу.
   */
  beforeAct?: ((key: string, signal: AbortSignal) => Promise<void>) | undefined
}

const MISMATCH_NEXT = 'Look at this screenshot before you click again.'

/** Клавиатуре точка не нужна: под капсулой она не бьёт никогда, а сверяются окна перед ней. */
const NOWHERE = (): Point[] => []

/**
 * Вызов простоял на паузе человека - модель узнаёт, сколько: пока она ждала, человек мог
 * поменять экран сам. Короче секунды - не пауза, а очередь.
 */
const pausedNote = (pausedMs: number): string =>
  pausedMs >= 1000
    ? `The user had you paused for ${Math.round(pausedMs / 1000)} s before this call ran; the screen may have changed.`
    : ''

/** Дисплеи по порядку для модели: главный - 1, остальные - слева направо. */
const ordered = (): Display[] =>
  listDisplays().sort(
    (a, b) =>
      Number(b.isMain) - Number(a.isMain) || a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y,
  )

/**
 * Computer Use (ADR 0057): снимки экрана и действия настоящими мышью и клавиатурой от имени
 * разговора. Координаты модели - пиксели её последнего снимка; после каждого действия она
 * получает новый снимок того же дисплея, а снимок, который уже не правда об экране, действие не
 * пускает (ADR 0129). Всё идёт через стол: один разговор за раз, пауза и остановка человеком.
 */
export class ComputerAgent {
  /** Последний снимок каждого разговора: в его пикселях модель называет точки, с ним сверяется экран. */
  private frames = new Map<string, Seen>()
  /** Разговоры, бравшие компьютер в нынешней работе: её конец возвращает человека к чату. */
  private used = new Set<string>()

  constructor(private readonly port: ComputerPort) {}

  screenshot(
    call: DeskCall,
    displayNumber: number | null,
    waitMs: number,
  ): Promise<ComputerAnswer> {
    return this.port.desk.run(call, async (signal, pausedMs) => {
      this.need(['screen'])
      await LIVE_MOTION.sleep(waitMs, signal)

      return this.shoot(call, this.pick(call, displayNumber), pausedNote(pausedMs))
    })
  }

  /** Область последнего снимка в полной плотности экрана: мелкий текст, значки. */
  zoom(call: DeskCall, corners: [number, number, number, number]): Promise<Picture> {
    return this.port.desk.run(call, async () => {
      this.need(['screen'])

      const frame = this.frameOf(call)

      return this.port.hiddenFromShot(() => shootRegion(frame.display, regionOf(frame, corners)))
    })
  }

  /** Клик; ответ - что нажато (ADR 0119), а не голые координаты: модель сверяет с намерением. */
  click(
    call: DeskCall,
    at: { x: number; y: number },
    options: { button: MouseButton; count: number; chord: KeyChord | null; expect?: string },
  ): Promise<ComputerAnswer> {
    const target = (frame: ShotFrame) => [toScreen(frame, at.x, at.y)]

    return this.act(call, target, async (frame, signal) => {
      const point = toScreen(frame, at.x, at.y)
      const modifiers = options.chord?.modifiers ?? []
      const seen = await this.port.hand.click(
        point,
        frame.display.bounds,
        { ...options, modifiers },
        signal,
      )

      return clickedText(seen, at)
    })
  }

  move(call: DeskCall, at: { x: number; y: number }): Promise<ComputerAnswer> {
    const target = (frame: ShotFrame) => [toScreen(frame, at.x, at.y)]

    return this.act(call, target, async (frame, signal) => {
      await this.port.hand.moveTo(toScreen(frame, at.x, at.y), frame.display.bounds, signal)

      return `The pointer is at (${at.x}, ${at.y}).`
    })
  }

  drag(
    call: DeskCall,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Promise<ComputerAnswer> {
    const ends = (frame: ShotFrame) => [
      toScreen(frame, from.x, from.y),
      toScreen(frame, to.x, to.y),
    ]

    return this.act(call, ends, async (frame, signal) => {
      await this.port.hand.drag(
        toScreen(frame, from.x, from.y),
        toScreen(frame, to.x, to.y),
        frame.display.bounds,
        signal,
      )

      return `Dragged from (${from.x}, ${from.y}) to (${to.x}, ${to.y}).`
    })
  }

  scroll(
    call: DeskCall,
    at: { x: number; y: number },
    by: { down: number; right: number },
  ): Promise<ComputerAnswer> {
    const target = (frame: ShotFrame) => [toScreen(frame, at.x, at.y)]

    return this.act(call, target, async (frame, signal) => {
      const { bounds } = frame.display
      const point = toScreen(frame, at.x, at.y)

      await this.port.hand.scroll(point, bounds, by.down, by.right, signal)

      return `Scrolled at (${at.x}, ${at.y}).`
    })
  }

  /**
   * Набор текста; submit - Return после него. Без submit модель сверяет набранное по снимку до
   * Return: сообщение людям не уходит вслепую, строки легли Shift+Return (ADR 0095).
   */
  type(call: DeskCall, text: string, submit: boolean): Promise<ComputerAnswer> {
    return this.act(call, NOWHERE, async (_frame, signal) => {
      await this.port.hand.type(text, signal, submit)

      if (submit) return `Typed ${text.length} characters and pressed Return.`

      const lines = isMultiline(text) ? '; line breaks went in as Shift+Return' : ''

      return `Typed ${text.length} characters${lines}. Before you send a message with Return, check the field in this screenshot: the text, the lines, the right chat.`
    })
  }

  key(call: DeskCall, chord: KeyChord, label: string, repeat: number): Promise<ComputerAnswer> {
    return this.act(call, NOWHERE, async (_frame, signal) => {
      await this.port.hand.press(chord, repeat, signal)

      return repeat > 1 ? `Pressed ${label} ${repeat} times.` : `Pressed ${label}.`
    })
  }

  /** Запустить приложение или вывести его вперёд: open -a на маке, меню «Пуск» на Windows. */
  openApp(call: DeskCall, name: string): Promise<ComputerAnswer> {
    return this.port.desk.run(call, async (signal) => {
      this.need(['screen'])
      await this.port.beforeAct?.(call.key, signal)

      const opened = await openApp(name, signal)

      await LIVE_MOTION.sleep(SETTLE_AFTER_OPEN_MS, signal)

      return this.shoot(call, this.pick(call, null), `Opened ${opened}.`)
    })
  }

  /**
   * Точки метки показа Walkthrough (ADR 0134) по последнему снимку разговора (key) - в точках
   * экрана. Снимок не годится для действия (нет его, пауза, перерыв, другой дисплей) или окна в
   * точках метки поменялись - отказ словами: метка поверх другого окна обманула бы человека. Ввод
   * человека не помеха: слушая показ, он двигает мышь.
   */
  aim(key: string, pixels: readonly Point[]): Aim {
    const seen = this.frames.get(key)
    const reason = this.outdatedOf(seen)

    if (reason || !seen) return { refusal: reason ?? SHOOT_AGAIN }

    const { frame } = seen
    const onScreen = (pixel: Point) => toScreen(frame, pixel.x, pixel.y)
    const changed = windowsChangedAt(seen, this.glance(), pixels.map(onScreen))

    return changed ? { refusal: changed } : { display: frame.display, toScreen: onScreen }
  }

  /** Что сейчас на экране помимо картинки: окна и время ввода - сверять метки с ним потом. */
  glance(): Glance {
    return glance(this.port.witness, LIVE_MOTION.now())
  }

  /** Сколько мс назад был последний ввод мыши и клавиатуры (и руки ИИ); не знаем - null. */
  quietMs(): number | null {
    const { inputAt } = this.glance()

    return inputAt === null ? null : LIVE_MOTION.now() - inputAt
  }

  /**
   * Отдать компьютер человеку (ADR 0134): показ просит его сделать шаг самому. Капсула и стрелка ИИ
   * уходят сразу; следующее действие ИИ - только по свежему снимку (стол считает перерыв).
   */
  handOver(key: string): void {
    this.port.desk.idle(key)
  }

  /** Разговор закрыт: его снимок больше не нужен, компьютер - свободен. */
  endConversation(key: string): void {
    this.frames.delete(key)
    this.used.delete(key)
    this.port.desk.endConversation(key)
  }

  /** Процесс разговора кончился: возвращать к чату, которого нет, нечего. */
  release(key: string): void {
    this.used.delete(key)
    this.port.desk.release(key)
  }

  /**
   * Работа разговора встала: капсула уходит сразу (ComputerDesk.idle). Брал он в этой работе
   * компьютер - человека возвращают к его чату (ADR 0130), но только если тот после последнего
   * снимка ИИ не трогал мышь и клавиатуру: иначе он уже работает сам (нажал Stop, пишет в другом
   * окне), и фокус, вырванный из-под рук, унёс бы его набор в поле чата.
   */
  idle(key: string): void {
    this.port.desk.idle(key)

    if (!this.used.delete(key)) return

    const seen = this.frames.get(key)

    if (seen && isTouchedSince(seen, this.glance())) return

    this.port.finished(key)
  }

  private need(permissions: ComputerPermission[]): void {
    assertComputerAccess(this.port.access(), permissions)
  }

  /**
   * Почему последний снимок разговора уже не правда об экране, не глядя на экран: его нет, после
   * него была пауза или перерыв, дисплей не тот (ADR 0129). Правда - null.
   */
  private outdatedOf(seen: Seen | undefined): string | null {
    const display = seen && listDisplays().find((one) => one.id === seen.frame.display.id)

    return outdated(seen, this.port.desk, display, Date.now())
  }

  /** Снимок для zoom: его область - пиксели последнего снимка, и он должен быть ещё правдой. */
  private frameOf(call: DeskCall): ShotFrame {
    const seen = this.frames.get(call.key)
    const reason = this.outdatedOf(seen)

    if (reason || !seen) throw new ComputerError('no-shot', `${reason ?? ''} ${SHOOT_AGAIN}`.trim())

    return seen.frame
  }

  /**
   * Сначала экран, потом действие (ADR 0129): снимок, по которому модель называет точки, должен
   * быть правдой. Его нет, после него была пауза или перерыв, человек трогал мышь или клавиатуру,
   * окна в точках действия (у клавиатуры - перед ней) открылись, закрылись или сдвинулись -
   * действие не идёт, модель получает свежий снимок и решает заново. Иначе рука действует,
   * приложение перерисовывается - и модель получает новый снимок того же дисплея. Капсула
   * пропускает клики сквозь себя, только если рука бьёт в точку под ней (targets): иначе нажатие
   * человека на Stop посреди действия проваливалось бы в приложение под капсулой.
   */
  private act(
    call: DeskCall,
    targets: (frame: ShotFrame) => Point[],
    work: (frame: ShotFrame, signal: AbortSignal) => Promise<string>,
  ): Promise<ComputerAnswer> {
    return this.port.desk.run(call, async (signal) => {
      this.need(['accessibility', 'screen'])
      // Показ: сначала договорить то, что модель сказала перед действием, - потом сверка экрана.
      await this.port.beforeAct?.(call.key, signal)

      const seen = this.frames.get(call.key)
      const reason = this.outdatedOf(seen)

      if (reason || !seen) return this.refuse(call, reason ?? '')

      const { frame } = seen

      // Человек двигает мышь - дождаться, пока отпустит, и уже тогда сверять экран.
      await this.port.hand.waitForStill(signal)

      const points = targets(frame)
      const changed = changedSince(seen, this.glance(), points)

      if (changed) return this.refuse(call, changed)

      const isUnder = points.some((point) => this.port.covers(point))

      if (isUnder) this.port.passThrough(true)

      let said: string
      let isRefusal = false

      try {
        said = await work(frame, signal)
      } catch (error) {
        // Проверка не пустила нажатие: модель видит, что там на самом деле, - свежим снимком.
        if (!(error instanceof ComputerError) || error.code !== 'mismatch') throw error

        said = `${error.message} ${MISMATCH_NEXT}`
        isRefusal = true
      } finally {
        if (isUnder) this.port.passThrough(false)
      }

      await LIVE_MOTION.sleep(SETTLE_AFTER_ACTION_MS, signal)

      const answer = await this.shoot(call, frame.display, said)

      return isRefusal ? { ...answer, isRefusal } : answer
    })
  }

  /**
   * Действие не сделано: экран уже не тот, что на снимке модели. Ответ - свежий снимок дисплея
   * прошлого снимка (нет его - где мышь) и причина: модель смотрит заново, а не жмёт вслепую.
   */
  private async refuse(call: DeskCall, reason: string): Promise<ComputerAnswer> {
    const answer = await this.shoot(call, this.pick(call, null), `${reason} ${LOOK_AGAIN}`)

    return { ...answer, isRefusal: true }
  }

  /** Какой дисплей снимать: названный, иначе прошлый, иначе тот, где сейчас мышь. */
  private pick(call: DeskCall, number: number | null): Display {
    const displays = ordered()

    if (number !== null) {
      const chosen = displays[number - 1]

      if (!chosen) {
        throw new ComputerError(
          'failed',
          `There is no display ${number}: there are ${displays.length}.`,
        )
      }

      return chosen
    }

    const last = this.frames.get(call.key)?.frame.display
    const chosen =
      displays.find((display) => display.id === last?.id) ??
      displayAt(displays, this.pointer() ?? { x: Number.NaN, y: Number.NaN }) ??
      displays[0]

    if (!chosen) throw new ComputerError('failed', 'macOS reports no displays.')

    return chosen
  }

  /**
   * Где мышь - для подписи к снимку и выбора дисплея. Не узнать (экран блокировки Windows) - не
   * беда: снимок важнее подписи.
   */
  private pointer(): { x: number; y: number } | null {
    try {
      return this.port.hand.cursor()
    } catch {
      return null
    }
  }

  /**
   * Снимок для модели - и запомнить его как то, что она видела. Счётчики стола, окна и время
   * ввода читаются до снимка: пауза или перемена посреди съёмки считается бывшей после него, в
   * пользу отказа.
   */
  private async shoot(call: DeskCall, display: Display, said: string): Promise<ComputerAnswer> {
    const displays = ordered()
    // Дисплей мог поменять размер или пропасть - берём его нынешний вид.
    const now = displays.find((one) => one.id === display.id) ?? displays[0] ?? display
    const { pauses, letGos } = this.port.desk
    const look = this.glance()
    const shot = await this.port.hiddenFromShot(() => shootDisplay(now))
    const at = this.pointer()
    const pointer = at ? toShot(shot.frame, at) : null
    const number = displays.indexOf(now) + 1

    this.frames.set(call.key, { ...look, frame: shot.frame, at: Date.now(), pauses, letGos })
    this.used.add(call.key)

    return {
      picture: shot,
      text: [
        said,
        `Screenshot of display ${number} of ${displays.length}, ${shot.frame.width}x${shot.frame.height} px: ` +
          'coordinates of your actions are pixels of this picture.',
        pointer
          ? `The mouse pointer (not drawn) is at (${pointer.x}, ${pointer.y}).`
          : 'The mouse pointer is on another display.',
      ]
        .filter(Boolean)
        .join(' '),
    }
  }
}
