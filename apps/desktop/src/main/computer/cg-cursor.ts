import { createRequire } from 'node:module'

import type * as Koffi from 'koffi'

import {
  CG_SUCCESS,
  ANY_DISPLAY,
  CF_STRING_UTF8,
  CORE_FOUNDATION_PATH,
  CURSOR_IN_BACKGROUND,
  APPLICATION_SERVICES_PATH,
} from './cg-events.constants'
import type { SystemCursor } from './computer.types'

/** Вызовы CoreGraphics для системной стрелки; ответ - CGError (0 - удалось). */
export type CursorNative = {
  /** Разрешить процессу прятать стрелку, когда он не на переднем плане. */
  allowInBackground: () => number
  hide: () => number
  show: () => number
}

/**
 * Стрелка мака через koffi (ADR 0008, 0079). Обычное CGDisplayHideCursor прячет её только у
 * приложения на переднем плане, а ИИ работает в чужих окнах: закрытое свойство соединения с
 * оконным сервером снимает это ограничение (им же пользуются утилиты вроде Cursorcerer).
 * Скрытие привязано к процессу: упадёт IDE - система вернёт стрелку сама.
 */
const loadCursorNative = (): CursorNative => {
  const koffi = createRequire(import.meta.url)('koffi') as typeof Koffi
  const cg = koffi.load(APPLICATION_SERVICES_PATH)
  const cf = koffi.load(CORE_FOUNDATION_PATH)
  const connection: () => number = cg.func('int32_t _CGSDefaultConnection()')
  const setProperty: (owner: number, target: number, key: unknown, value: unknown) => number =
    cg.func(
      'int32_t CGSSetConnectionProperty(int32_t owner, int32_t target, void *key, void *value)',
    )
  const createString: (allocator: null, text: string, encoding: number) => unknown = cf.func(
    'void *CFStringCreateWithCString(void *allocator, const char *text, uint32_t encoding)',
  )
  const release: (ref: unknown) => void = cf.func('void CFRelease(void *ref)')
  const hide: (display: number) => number = cg.func('int32_t CGDisplayHideCursor(uint32_t display)')
  const show: (display: number) => number = cg.func('int32_t CGDisplayShowCursor(uint32_t display)')
  const yes: unknown = koffi.decode(cf.symbol('kCFBooleanTrue'), 'void *')

  return {
    allowInBackground: () => {
      const id = connection()
      const key = createString(null, CURSOR_IN_BACKGROUND, CF_STRING_UTF8)

      try {
        return setProperty(id, id, key, yes)
      } finally {
        release(key)
      }
    },
    hide: () => hide(ANY_DISPLAY),
    show: () => show(ANY_DISPLAY),
  }
}

/**
 * Системная стрелка мака. Разрешение прятать из фона спрашивается один раз. Не дали (вызова нет в
 * этой версии macOS, оконный сервер отказал) - hide отвечает false, и стрелка ИИ не рисуется.
 */
export const createMacCursor = (load: () => CursorNative): SystemCursor => {
  let native: CursorNative | null = null
  let isAllowed: boolean | null = null

  return {
    hide: () => {
      try {
        native ??= load()

        if (isAllowed === null) {
          const error = native.allowInBackground()

          isAllowed = error === CG_SUCCESS

          if (!isAllowed) console.warn(`[computer] macOS refused to hide the cursor: ${error}`)
        }

        return isAllowed && native.hide() === CG_SUCCESS
      } catch (error) {
        console.warn('[computer] cannot hide the cursor on this macOS', error)
        isAllowed = false

        return false
      }
    },
    show: () => {
      native?.show()
    },
  }
}

export const macCursor: SystemCursor = createMacCursor(loadCursorNative)
