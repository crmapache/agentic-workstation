import { createRequire } from 'node:module'

import type * as Koffi from 'koffi'

import {
  NULL_WINDOW,
  CF_STRING_UTF8,
  ANY_INPUT_EVENT,
  CF_NUMBER_DOUBLE,
  HID_SYSTEM_STATE,
  WINDOW_SHARING_NONE,
  CORE_FOUNDATION_PATH,
  WINDOW_LIST_ON_SCREEN,
  WINDOW_LIST_NO_DESKTOP,
  APPLICATION_SERVICES_PATH,
} from './cg-events.constants'
import { sceneOf } from './screen-scene'
import type { RawWindow, ScreenWitness } from './screen-scene'

type Ref = unknown

type SceneNative = {
  windows: () => RawWindow[]
  idleSeconds: () => number
}

/** Поля словаря окна (CGWindow.h): значения ключей - их же имена. */
const FIELDS = {
  id: 'kCGWindowNumber',
  pid: 'kCGWindowOwnerPID',
  layer: 'kCGWindowLayer',
  alpha: 'kCGWindowAlpha',
  sharing: 'kCGWindowSharingState',
  bounds: 'kCGWindowBounds',
} as const

/**
 * Окна мака и время последнего ввода (ADR 0129) - оконный сервер через CoreGraphics, без
 * обращения к самим приложениям: список окон - доли миллисекунды (замер в ADR), не нужен ни
 * «Универсальный доступ», ни ответ зависшего приложения. koffi - на первом вызове, как в
 * cg-events.ts.
 */
const loadScene = (): SceneNative => {
  const koffi = createRequire(import.meta.url)('koffi') as typeof Koffi
  const cg = koffi.load(APPLICATION_SERVICES_PATH)
  const cf = koffi.load(CORE_FOUNDATION_PATH)
  // Безымянная структура: имя CGRect koffi не дал бы объявить второй раз.
  const RECT = koffi.struct({ x: 'double', y: 'double', width: 'double', height: 'double' })
  const copyWindows = cg.func(
    'void *CGWindowListCopyWindowInfo(uint32_t option, uint32_t relativeToWindow)',
  )
  const rectOf = cg.func('CGRectMakeWithDictionaryRepresentation', 'bool', [
    'void *',
    koffi.out(koffi.pointer(RECT)),
  ])
  const sinceInput = cg.func(
    'double CGEventSourceSecondsSinceLastEventType(int32_t state, uint32_t type)',
  )
  const count = cf.func('long CFArrayGetCount(void *array)')
  const item = cf.func('void *CFArrayGetValueAtIndex(void *array, long index)')
  const value = cf.func('void *CFDictionaryGetValue(void *dict, void *key)')
  const toNumber = cf.func('bool CFNumberGetValue(void *number, long type, _Out_ double *value)')
  const createString = cf.func(
    'void *CFStringCreateWithCString(void *alloc, const char *text, uint32_t encoding)',
  )
  const release = cf.func('void CFRelease(void *ref)')
  // Ключи создаются один раз и живут, пока жив процесс.
  const keys = Object.fromEntries(
    Object.entries(FIELDS).map(([field, name]) => [
      field,
      createString(null, name, CF_STRING_UTF8),
    ]),
  ) as Record<keyof typeof FIELDS, Ref>

  const numberOf = (window: Ref, field: keyof typeof FIELDS): number | null => {
    const ref: Ref = value(window, keys[field])
    const out = [0]

    return ref && toNumber(ref, CF_NUMBER_DOUBLE, out) ? (out[0] ?? null) : null
  }

  const rowOf = (window: Ref): RawWindow | null => {
    const id = numberOf(window, 'id')
    const bounds = { x: 0, y: 0, width: 0, height: 0 }
    const boundsRef: Ref = value(window, keys.bounds)

    if (id === null || !boundsRef || !rectOf(boundsRef, bounds)) return null

    return {
      id,
      pid: numberOf(window, 'pid') ?? 0,
      // Уровень 0 - обычные окна приложений, ниже - рабочий стол, выше - меню, Dock, панели.
      isOrdinary: (numberOf(window, 'layer') ?? 0) <= 0,
      // Прозрачное окно не видно и клики не ловит.
      isShown: (numberOf(window, 'alpha') ?? 1) > 0,
      isCaptured: numberOf(window, 'sharing') !== WINDOW_SHARING_NONE,
      bounds,
    }
  }

  return {
    windows: () => {
      const list: Ref = copyWindows(WINDOW_LIST_ON_SCREEN | WINDOW_LIST_NO_DESKTOP, NULL_WINDOW)

      if (!list) return []

      try {
        const rows: RawWindow[] = []

        for (let index = 0; index < Number(count(list)); index += 1) {
          const row = rowOf(item(list, index))

          if (row) rows.push(row)
        }

        return rows
      } finally {
        release(list)
      }
    },
    idleSeconds: () => Number(sinceInput(HID_SYSTEM_STATE, ANY_INPUT_EVENT)),
  }
}

let native: SceneNative | null = null

const loaded = (): SceneNative => (native ??= loadScene())

/** Окна мака сверху вниз, как их отдаёт оконный сервер, до отбора. */
export const macWindows = (): RawWindow[] => loaded().windows()

/**
 * Свидетель экрана мака: окна сверху вниз без своих окон, закрытых от захвата, и сколько назад
 * был последний ввод. Счётчик ввода общий у человека и руки ИИ (ADR 0057): события руки его тоже
 * сбрасывают - поэтому агент сравнивает время ввода со снимком, а не с нулём.
 */
export const macWitness: ScreenWitness = {
  scene: () => sceneOf(macWindows(), process.pid),
  idleMs: () => loaded().idleSeconds() * 1000,
}
