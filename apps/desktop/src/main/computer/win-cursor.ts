import { rmSync, existsSync, writeFileSync } from 'node:fs'

import type { SystemCursor } from './computer.types'
import {
  IMAGE_CURSOR,
  SPI_SETCURSORS,
  SYSTEM_CURSORS,
  BLANK_CURSOR_SIDE,
  BLANK_CURSOR_MASK_BYTES,
} from './win-input.constants'
import type { Handle } from './win-native'
import { winStructs } from './win-structs'

/** Вызовы user32 для курсоров. BOOL - int32, как у win-native.ts. */
export type WinCursorNative = {
  /** Пустой курсор: прозрачный во всё поле. */
  createBlank: () => Handle
  copy: (cursor: Handle) => Handle
  /** SetSystemCursor забирает курсор себе и сам его уничтожает. */
  setSystem: (cursor: Handle, id: number) => number
  destroy: (cursor: Handle) => number
  /** Перечитать курсоры человека из реестра - вернуть его схему. */
  restoreAll: () => number
}

/**
 * Метка на диске «курсоры подменены»: упади IDE посреди работы ИИ, курсоры остались бы пустыми, и
 * следующий запуск по метке их вернёт.
 */
export type CursorMark = {
  set: () => void
  clear: () => void
  isSet: () => boolean
}

/** Подписаться на выход процесса; ответ - отписка. */
export type ExitHook = (run: () => void) => () => void

export const fileMark = (path: string): CursorMark => ({
  set: () => writeFileSync(path, ''),
  clear: () => rmSync(path, { force: true }),
  isSet: () => existsSync(path),
})

export const processExit: ExitHook = (run) => {
  process.once('exit', run)

  return () => process.off('exit', run)
}

/** user32 через koffi (ADR 0008, 0058); грузится на первом скрытии - на маке его не зовёт никто. */
export const loadWinCursorNative = (): WinCursorNative => {
  const { koffi } = winStructs()
  const user32 = koffi.load('user32.dll')
  const createCursor: (
    instance: null,
    hotX: number,
    hotY: number,
    width: number,
    height: number,
    andMask: Uint8Array,
    xorMask: Uint8Array,
  ) => Handle = user32.func('CreateCursor', 'void *', [
    'void *',
    'int32',
    'int32',
    'int32',
    'int32',
    'void *',
    'void *',
  ])
  const copyImage: (image: Handle, type: number, cx: number, cy: number, flags: number) => Handle =
    user32.func('CopyImage', 'void *', ['void *', 'uint32', 'int32', 'int32', 'uint32'])
  const parametersInfo: (action: number, param: number, data: null, flags: number) => number =
    user32.func('SystemParametersInfoW', 'int32', ['uint32', 'uint32', 'void *', 'uint32'])

  return {
    createBlank: () =>
      createCursor(
        null,
        0,
        0,
        BLANK_CURSOR_SIDE,
        BLANK_CURSOR_SIDE,
        new Uint8Array(BLANK_CURSOR_MASK_BYTES).fill(0xff),
        new Uint8Array(BLANK_CURSOR_MASK_BYTES),
      ),
    copy: (cursor) => copyImage(cursor, IMAGE_CURSOR, 0, 0, 0),
    setSystem: user32.func('SetSystemCursor', 'int32', ['void *', 'uint32']),
    destroy: user32.func('DestroyCursor', 'int32', ['void *']),
    restoreAll: () => parametersInfo(SPI_SETCURSORS, 0, null, 0),
  }
}

/**
 * Системный курсор Windows (ADR 0079). Спрятать курсор у чужого окна Windows не даёт, поэтому на
 * время работы ИИ все системные курсоры подменяются пустыми, а потом схема человека
 * перечитывается из реестра. Страховки от пустых курсоров навсегда - метка на диске (вернёт
 * следующий запуск) и выход процесса.
 */
export const createWindowsCursor = (
  load: () => WinCursorNative,
  mark: CursorMark,
  onExit: ExitHook = processExit,
): SystemCursor => {
  let native: WinCursorNative | null = null
  let unsubscribe: (() => void) | null = null

  const restore = () => {
    unsubscribe?.()
    unsubscribe = null
    native?.restoreAll()
    mark.clear()
  }

  return {
    hide: () => {
      try {
        native ??= load()
        // Метка - до подмены: падение посреди неё тоже должно вернуться.
        mark.set()
        unsubscribe = onExit(restore)

        const blank = native.createBlank()

        if (!blank) throw new Error('CreateCursor failed')

        try {
          for (const id of SYSTEM_CURSORS) {
            // Каждому своя копия: SetSystemCursor уничтожает курсор, который получил.
            if (!native.setSystem(native.copy(blank), id)) throw new Error(`SetSystemCursor ${id}`)
          }
        } finally {
          native.destroy(blank)
        }

        return true
      } catch (error) {
        console.warn('[computer] cannot hide the cursor on Windows', error)
        restore()

        return false
      }
    },
    show: restore,
  }
}

/** Прошлый запуск упал, пока курсоры были подменены, - вернуть их человеку. */
export const recoverWindowsCursor = (load: () => WinCursorNative, mark: CursorMark): void => {
  if (!mark.isSet()) return

  load().restoreAll()
  mark.clear()
}
