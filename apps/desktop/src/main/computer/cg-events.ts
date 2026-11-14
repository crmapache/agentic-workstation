import { createRequire } from 'node:module'

import type * as Koffi from 'koffi'

import {
  EVENT,
  MOUSE_BUTTON,
  HID_EVENT_TAP,
  UNICODE_CHUNK,
  MODIFIER_FLAGS,
  HID_SYSTEM_STATE,
  FIELD_CLICK_STATE,
  SCROLL_UNIT_PIXEL,
  CORE_FOUNDATION_PATH,
  APPLICATION_SERVICES_PATH,
} from './cg-events.constants'
import type { Point, InputDriver, MouseButton, MouseMotion } from './computer.types'

type EventRef = unknown

type Native = {
  create: (source: null) => EventRef
  location: (event: EventRef) => Point
  mouse: (source: null, type: number, at: Point, button: number) => EventRef
  keyboard: (source: null, keyCode: number, isDown: boolean) => EventRef
  setUnicode: (event: EventRef, length: number, chars: Uint16Array) => void
  scroll: (source: null, units: number, count: number, y: number, x: number, z: number) => EventRef
  setFlags: (event: EventRef, flags: number) => void
  setField: (event: EventRef, field: number, value: number) => void
  post: (tap: number, event: EventRef) => void
  /** koffi отдаёт 64-битное число обычным, пока оно точное, и BigInt - когда нет. */
  flagsState: (state: number) => number | bigint
  buttonState: (state: number, button: number) => boolean
  release: (ref: EventRef) => void
}

/**
 * Функции CoreGraphics через koffi (ADR 0008): в Electron нет ввода в чужие приложения. require -
 * на первом действии, а не импортом: koffi грузится около 25 мс, и запуск IDE их не ждёт.
 */
const loadNative = (): Native => {
  const koffi = createRequire(import.meta.url)('koffi') as typeof Koffi
  const cg = koffi.load(APPLICATION_SERVICES_PATH)
  const cf = koffi.load(CORE_FOUNDATION_PATH)

  koffi.struct('CGPoint', { x: 'double', y: 'double' })

  return {
    create: cg.func('void *CGEventCreate(void *source)'),
    location: cg.func('CGPoint CGEventGetLocation(void *event)'),
    mouse: cg.func(
      'void *CGEventCreateMouseEvent(void *source, uint32_t type, CGPoint at, uint32_t button)',
    ),
    keyboard: cg.func('void *CGEventCreateKeyboardEvent(void *source, uint16_t key, bool down)'),
    setUnicode: cg.func(
      'void CGEventKeyboardSetUnicodeString(void *event, unsigned long length, const uint16_t *chars)',
    ),
    // Вариант без переменного числа аргументов (macOS 10.13+): у CGEventCreateScrollWheelEvent
    // его нет, а koffi вызывает функции с «...» только с явными типами каждого.
    scroll: cg.func(
      'void *CGEventCreateScrollWheelEvent2(void *source, uint32_t units, uint32_t count, int32_t y, int32_t x, int32_t z)',
    ),
    setFlags: cg.func('void CGEventSetFlags(void *event, uint64_t flags)'),
    setField: cg.func(
      'void CGEventSetIntegerValueField(void *event, uint32_t field, int64_t value)',
    ),
    post: cg.func('void CGEventPost(uint32_t tap, void *event)'),
    flagsState: cg.func('uint64_t CGEventSourceFlagsState(int32_t state)'),
    buttonState: cg.func('bool CGEventSourceButtonState(int32_t state, uint32_t button)'),
    release: cf.func('void CFRelease(void *ref)'),
  }
}

const MOUSE_TYPES: Record<MouseButton, Record<MouseMotion, number>> = {
  left: { move: EVENT.moved, down: EVENT.leftDown, up: EVENT.leftUp, drag: EVENT.leftDragged },
  right: { move: EVENT.moved, down: EVENT.rightDown, up: EVENT.rightUp, drag: EVENT.rightDragged },
  middle: { move: EVENT.moved, down: EVENT.otherDown, up: EVENT.otherUp, drag: EVENT.otherDragged },
}

/** Отдать событие системе и освободить: CGEventPost его копирует. */
const postAndRelease = (native: Native, event: EventRef) => {
  if (!event) throw new Error('CoreGraphics не создал событие')

  native.post(HID_EVENT_TAP, event)
  native.release(event)
}

let native: Native | null = null

const loaded = (): Native => (native ??= loadNative())

/**
 * Настоящие мышь и клавиатура мака. Без разрешения «Универсальный доступ» система молча
 * выбрасывает события - поэтому до первого действия разрешение проверяет computer-access.
 */
export const macInput: InputDriver = {
  cursor: () => {
    const lib = loaded()
    const probe = lib.create(null)
    const at = lib.location(probe)

    lib.release(probe)

    return { x: at.x, y: at.y }
  },
  mouse: (motion, at, button, clicks, flags) => {
    const lib = loaded()
    const event = lib.mouse(null, MOUSE_TYPES[button][motion], at, MOUSE_BUTTON[button])

    lib.setField(event, FIELD_CLICK_STATE, Math.max(1, clicks))
    lib.setFlags(event, flags)
    postAndRelease(lib, event)
  },
  key: (keyCode, isDown, flags) => {
    const lib = loaded()
    const event = lib.keyboard(null, keyCode, isDown)

    lib.setFlags(event, flags)
    postAndRelease(lib, event)
  },
  text: (chunk, phase) => {
    const lib = loaded()
    const chars = Uint16Array.from(chunk, (_, index) => chunk.charCodeAt(index))
    const phases = phase === 'tap' ? [true, false] : [phase === 'down']

    for (const isDown of phases) {
      // Код клавиши 0 - только носитель: приложение берёт текст события, а не клавишу.
      const event = lib.keyboard(null, 0, isDown)

      lib.setUnicode(event, chars.length, chars)
      lib.setFlags(event, 0)
      postAndRelease(lib, event)
    }
  },
  // Мак берёт до UNICODE_CHUNK знаков одним событием и не путает их (проверено на TextEdit).
  typing: { chunk: UNICODE_CHUNK, holdMs: 0, gapMs: 8 },
  scroll: (down, right) => {
    const lib = loaded()
    // У CoreGraphics колесо вверх - положительное: вниз страницы - отрицательное.
    const event = lib.scroll(null, SCROLL_UNIT_PIXEL, 2, -Math.round(down), -Math.round(right), 0)

    postAndRelease(lib, event)
  },
  // Флаги модификаторов - в младших 24 битах: Number не теряет их ни из числа, ни из BigInt.
  heldFlags: () => Number(loaded().flagsState(HID_SYSTEM_STATE)) & MODIFIER_FLAGS,
  isButtonHeld: () => {
    const lib = loaded()

    return [MOUSE_BUTTON.left, MOUSE_BUTTON.right].some((button) =>
      lib.buttonState(HID_SYSTEM_STATE, button),
    )
  },
}
