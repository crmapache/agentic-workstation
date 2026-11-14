import type { Point } from './computer.types'
import type { WinInput } from './win-inputs'
import { winStructs } from './win-structs'

export type Handle = unknown

/** Вызовы Windows. BOOL - int32: у Windows он четыре байта, а не байт C. */
export type WinNative = {
  sendInput: (count: number, input: WinInput, size: number) => number
  setCursorPos: (x: number, y: number) => number
  getCursorPos: (point: Partial<Point>) => number
  asyncKeyState: (vk: number) => number
  mapVirtualKey: (code: number, type: number) => number
  windowFromPoint: (point: Point) => Handle
  foregroundWindow: () => Handle
  ancestor: (window: Handle, flags: number) => Handle
  windowProcessId: (window: Handle, pid: number[]) => number
  openProcess: (access: number, inherit: number, pid: number) => Handle
  closeHandle: (handle: Handle) => number
  currentProcess: () => Handle
  openProcessToken: (process: Handle, access: number, token: Handle[]) => number
  tokenInformation: (
    token: Handle,
    kind: number,
    info: number[],
    size: number,
    returned: number[],
  ) => number
  /** GetSystemMetrics: SM_SWAPBUTTON - кнопки мыши переставлены (левша). */
  systemMetric: (index: number) => number
  inputSize: number
}

/**
 * user32, kernel32 и advapi32 через koffi (ADR 0008, 0058). Грузятся на первом действии: на маке
 * этого файла не зовёт никто.
 */
export const loadWinNative = (): WinNative => {
  const { koffi, POINT, INPUT } = winStructs()
  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  const advapi32 = koffi.load('advapi32.dll')
  const outUint = koffi.out(koffi.pointer('uint32'))

  return {
    sendInput: user32.func('SendInput', 'uint32', ['uint32', koffi.pointer(INPUT), 'int32']),
    setCursorPos: user32.func('SetCursorPos', 'int32', ['int32', 'int32']),
    getCursorPos: user32.func('GetCursorPos', 'int32', [koffi.out(koffi.pointer(POINT))]),
    asyncKeyState: user32.func('GetAsyncKeyState', 'int16', ['int32']),
    mapVirtualKey: user32.func('MapVirtualKeyW', 'uint32', ['uint32', 'uint32']),
    windowFromPoint: user32.func('WindowFromPoint', 'void *', [POINT]),
    foregroundWindow: user32.func('GetForegroundWindow', 'void *', []),
    ancestor: user32.func('GetAncestor', 'void *', ['void *', 'uint32']),
    windowProcessId: user32.func('GetWindowThreadProcessId', 'uint32', ['void *', outUint]),
    openProcess: kernel32.func('OpenProcess', 'void *', ['uint32', 'int32', 'uint32']),
    closeHandle: kernel32.func('CloseHandle', 'int32', ['void *']),
    currentProcess: kernel32.func('GetCurrentProcess', 'void *', []),
    openProcessToken: advapi32.func('OpenProcessToken', 'int32', [
      'void *',
      'uint32',
      koffi.out(koffi.pointer('void *')),
    ]),
    tokenInformation: advapi32.func('GetTokenInformation', 'int32', [
      'void *',
      'int32',
      outUint,
      'uint32',
      outUint,
    ]),
    systemMetric: user32.func('GetSystemMetrics', 'int32', ['int32']),
    inputSize: koffi.sizeof(INPUT),
  }
}
