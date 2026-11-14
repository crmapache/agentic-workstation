import { createRequire } from 'node:module'

import type * as Koffi from 'koffi'

export type WinStructs = {
  koffi: typeof Koffi
  POINT: Koffi.TypeObject
  INPUT: Koffi.TypeObject
}

let structs: WinStructs | null = null

/**
 * Структуры Windows для koffi: POINT и INPUT (объединение мыши, клавиатуры и «железа»).
 * Раскладка - как у Windows x64: INPUT 40 байт, объединение со смещения 8 (сверяет тест на любой
 * системе - koffi раскладывает поля по тем же правилам). Безымянные: повторное объявление с тем же
 * именем koffi отвергает. require - на первом вызове, как у всего koffi (ADR 0008).
 */
export const winStructs = (): WinStructs => {
  if (structs) return structs

  const koffi = createRequire(import.meta.url)('koffi') as typeof Koffi
  const MOUSEINPUT = koffi.struct({
    dx: 'int32',
    dy: 'int32',
    // DWORD у Windows, но колесо вниз - отрицательное: те же 4 байта со знаком.
    mouseData: 'int32',
    dwFlags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'uintptr_t',
  })
  const KEYBDINPUT = koffi.struct({
    wVk: 'uint16',
    wScan: 'uint16',
    dwFlags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'uintptr_t',
  })
  const HARDWAREINPUT = koffi.struct({ uMsg: 'uint32', wParamL: 'uint16', wParamH: 'uint16' })

  structs = {
    koffi,
    POINT: koffi.struct({ x: 'int32', y: 'int32' }),
    INPUT: koffi.struct({
      type: 'uint32',
      u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }),
    }),
  }

  return structs
}
