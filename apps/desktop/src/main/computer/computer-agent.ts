import type { ComputerState, ComputerPermission } from '@shared/computer'

import { assertComputerAccess } from './computer-access'
import { openApp } from './computer-apps'
import type { DeskCall, ComputerDesk } from './computer-desk'
import { ComputerError } from './computer-error'
import { toShot, regionOf, toScreen, displayAt, isSameDisplay } from './computer-geometry'
import type { Display, ShotFrame } from './computer-geometry'
import { LIVE_MOTION } from './computer-hand'
import type { ComputerHand } from './computer-hand'
import type { KeyChord } from './computer-keys'
import { shootRegion, listDisplays, shootDisplay } from './computer-screen'
import type { Picture } from './computer-screen'
import { SETTLE_AFTER_OPEN_MS, SETTLE_AFTER_ACTION_MS } from './computer.constants'
import type { Point, MouseButton } from './computer.types'

/** Ответ инструмента: картинка экрана и что про неё знать. */
export type ComputerAnswer = { picture: Picture; text: string }

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
}

const NO_SHOT =
  'Take a screenshot first: the coordinates of every action are pixels of your latest screenshot.'

const PAUSED_SINCE =
  'The user paused you after your latest screenshot, so this action did not run: the screen ' +
  'may have changed. Take a new screenshot and decide again.'

const LAYOUT_CHANGED =
  'The displays changed since your latest screenshot (one was connected, removed or resized), ' +
  'so this action did not run. Take a new screenshot.'

/** Клавиатуре точка не нужна: под капсулой она не бьёт никогда. */
const NOWHERE = (): Point[] => []

/** Снимок разговора и номер паузы, при которой он сделан. */
type Seen = { frame: ShotFrame; pauses: number }

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
 * получает новый снимок того же дисплея. Всё идёт через стол: один разговор за раз, пауза и
 * остановка человеком.
 */
export class ComputerAgent {
  /** Последний снимок каждого разговора: в его пикселях модель называет точки. */
  private frames = new Map<string, Seen>()

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

  click(
    call: DeskCall,
    at: { x: number; y: number },
    options: { button: MouseButton; count: number; chord: KeyChord | null },
  ): Promise<ComputerAnswer> {
    const target = (frame: ShotFrame) => [toScreen(frame, at.x, at.y)]

    return this.act(call, target, async (frame, signal) => {
      const point = toScreen(frame, at.x, at.y)
      const modifiers = options.chord?.modifiers ?? []

      await this.port.hand.click(point, frame.display.bounds, { ...options, modifiers }, signal)

      return `Clicked at (${at.x}, ${at.y}).`
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

  type(call: DeskCall, text: string): Promise<ComputerAnswer> {
    return this.act(call, NOWHERE, async (_frame, signal) => {
      await this.port.hand.type(text, signal)

      return `Typed ${text.length} characters.`
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

      const opened = await openApp(name, signal)

      await LIVE_MOTION.sleep(SETTLE_AFTER_OPEN_MS, signal)

      return this.shoot(call, this.pick(call, null), `Opened ${opened}.`)
    })
  }

  /** Разговор закрыт: его снимок больше не нужен, компьютер - свободен. */
  endConversation(key: string): void {
    this.frames.delete(key)
    this.port.desk.endConversation(key)
  }

  release(key: string): void {
    this.port.desk.release(key)
  }

  private need(permissions: ComputerPermission[]): void {
    assertComputerAccess(this.port.access(), permissions)
  }

  /**
   * Снимок, по которому модель называет точки, - только если он ещё правда: после него не было
   * паузы (человек мог всё поменять) и дисплей тот же.
   */
  private frameOf(call: DeskCall): ShotFrame {
    const seen = this.frames.get(call.key)

    if (!seen) throw new ComputerError('no-shot', NO_SHOT)

    if (seen.pauses !== this.port.desk.pauses) throw new ComputerError('no-shot', PAUSED_SINCE)

    const now = listDisplays().find((display) => display.id === seen.frame.display.id)

    if (!isSameDisplay(seen.frame.display, now)) throw new ComputerError('no-shot', LAYOUT_CHANGED)

    return seen.frame
  }

  /**
   * Действие руки: человек не трогает мышь - рука действует, приложение перерисовывается - и
   * модель получает новый снимок того же дисплея. Капсула пропускает клики сквозь себя, только
   * если рука бьёт в точку под ней (targets): иначе нажатие человека на Stop посреди действия
   * проваливалось бы в приложение под капсулой.
   */
  private act(
    call: DeskCall,
    targets: (frame: ShotFrame) => Point[],
    work: (frame: ShotFrame, signal: AbortSignal) => Promise<string>,
  ): Promise<ComputerAnswer> {
    return this.port.desk.run(call, async (signal, pausedMs) => {
      this.need(['accessibility', 'screen'])

      const frame = this.frameOf(call)

      await this.port.hand.waitForStill(signal)

      const isUnder = targets(frame).some((point) => this.port.covers(point))

      if (isUnder) this.port.passThrough(true)

      let said: string

      try {
        said = await work(frame, signal)
      } finally {
        if (isUnder) this.port.passThrough(false)
      }

      await LIVE_MOTION.sleep(SETTLE_AFTER_ACTION_MS, signal)

      return this.shoot(call, frame.display, [pausedNote(pausedMs), said].filter(Boolean).join(' '))
    })
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

  private async shoot(call: DeskCall, display: Display, said: string): Promise<ComputerAnswer> {
    const displays = ordered()
    // Дисплей мог поменять размер или пропасть - берём его нынешний вид.
    const now = displays.find((one) => one.id === display.id) ?? displays[0] ?? display
    const shot = await this.port.hiddenFromShot(() => shootDisplay(now))
    const at = this.pointer()
    const pointer = at ? toShot(shot.frame, at) : null
    const number = displays.indexOf(now) + 1

    this.frames.set(call.key, { frame: shot.frame, pauses: this.port.desk.pauses })

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
