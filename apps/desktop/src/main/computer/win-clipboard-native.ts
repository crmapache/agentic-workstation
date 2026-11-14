import { winStructs } from './win-structs'

export type ClipHandle = unknown

/** Сообщение окну-владельцу буфера: обработано - true, остальное отдаётся Windows. */
export type ClipMessageHandler = (message: number, wParam: number) => boolean

/** Вызовы Windows для буфера обмена и окна-владельца. BOOL - int32, как у win-native.ts. */
export type ClipNative = {
  openClipboard: (owner: ClipHandle) => number
  closeClipboard: () => number
  emptyClipboard: () => number
  setClipboardData: (format: number, data: ClipHandle) => ClipHandle
  getClipboardData: (format: number) => ClipHandle
  enumClipboardFormats: (format: number) => number
  registerFormat: (name: string) => number
  clipboardOwner: () => ClipHandle
  globalAlloc: (flags: number, size: number) => ClipHandle
  globalLock: (memory: ClipHandle) => ClipHandle
  globalUnlock: (memory: ClipHandle) => number
  globalSize: (memory: ClipHandle) => number
  globalFree: (memory: ClipHandle) => ClipHandle
  /** Копия size байт по адресу. */
  read: (pointer: ClipHandle, size: number) => Uint8Array
  /** Записать байты по адресу. */
  write: (pointer: ClipHandle, bytes: Uint8Array) => void
  /** Невидимое окно только для сообщений (HWND_MESSAGE): им IDE владеет буфером. */
  createWindow: (onMessage: ClipMessageHandler) => ClipHandle
  /**
   * Дождаться, что окно в фокусе разбирает сообщения (WM_NULL с таймаутом, в потоке koffi -
   * главный поток не ждёт). Зависшее - сразу false.
   */
  focusResponds: (timeoutMs: number) => Promise<boolean>
}

/** WPARAM, LPARAM и LRESULT: koffi отдаёт их числом или BigInt - смотря по величине. */
type Word = number | bigint

/** Что koffi заполняет в GUITHREADINFO: окна потока, у которого фокус. */
type GuiThreadInfo = { cbSize: number; hwndActive?: ClipHandle; hwndFocus?: ClipHandle }

const WM_NULL = 0x0000
const SMTO_ABORTIFHUNG = 0x0002
const HWND_MESSAGE = BigInt.asUintN(64, -3n)
const CLASS_NAME = 'AgenticWorkstationClipboard'

/**
 * user32 и kernel32 для буфера обмена через koffi (ADR 0008, 0058). Окно-владелец - с
 * процедурой на JS (koffi.register): Windows зовёт её из цикла сообщений главного потока
 * Electron, когда приложение просит отложенный текст. Грузится на первой вставке.
 */
export const loadClipNative = (): ClipNative => {
  const { koffi } = winStructs()
  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  const WNDPROC = koffi.proto('__stdcall', 'ClipWndProc', 'intptr_t', [
    'void *',
    'uint32',
    'uintptr_t',
    'intptr_t',
  ])
  const WNDCLASSEXW = koffi.struct({
    cbSize: 'uint32',
    style: 'uint32',
    lpfnWndProc: koffi.pointer(WNDPROC),
    cbClsExtra: 'int32',
    cbWndExtra: 'int32',
    hInstance: 'void *',
    hIcon: 'void *',
    hCursor: 'void *',
    hbrBackground: 'void *',
    lpszMenuName: 'str16',
    lpszClassName: 'str16',
    hIconSm: 'void *',
  })
  const RECT = koffi.struct({ left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' })
  const GUITHREADINFO = koffi.struct({
    cbSize: 'uint32',
    flags: 'uint32',
    hwndActive: 'void *',
    hwndFocus: 'void *',
    hwndCapture: 'void *',
    hwndMenuOwner: 'void *',
    hwndMoveSize: 'void *',
    hwndCaret: 'void *',
    rcCaret: RECT,
  })
  const defWindowProc = user32.func('DefWindowProcW', 'intptr_t', [
    'void *',
    'uint32',
    'uintptr_t',
    'intptr_t',
  ]) as (window: unknown, message: number, wParam: Word, lParam: Word) => Word
  const registerClass = user32.func('RegisterClassExW', 'uint16', [koffi.pointer(WNDCLASSEXW)])
  const createWindowEx: (...args: unknown[]) => ClipHandle = user32.func(
    'CreateWindowExW',
    'void *',
    [
      'uint32',
      'str16',
      'str16',
      'uint32',
      'int32',
      'int32',
      'int32',
      'int32',
      'void *',
      'void *',
      'void *',
      'void *',
    ],
  )
  const moveMemory: (to: unknown, from: unknown, size: number) => void = kernel32.func(
    'RtlMoveMemory',
    'void',
    ['void *', 'void *', 'uintptr_t'],
  )
  const moduleHandle: (name: string | null) => ClipHandle = kernel32.func(
    'GetModuleHandleW',
    'void *',
    ['str16'],
  )
  const guiThreadInfo: (thread: number, info: GuiThreadInfo) => number = user32.func(
    'GetGUIThreadInfo',
    'int32',
    ['uint32', koffi.inout(koffi.pointer(GUITHREADINFO))],
  )
  const foregroundWindow: () => ClipHandle = user32.func('GetForegroundWindow', 'void *', [])
  const sendMessageTimeout = user32.func('SendMessageTimeoutW', 'intptr_t', [
    'void *',
    'uint32',
    'uintptr_t',
    'intptr_t',
    'uint32',
    'uint32',
    koffi.out(koffi.pointer('uintptr_t')),
  ])

  return {
    openClipboard: user32.func('OpenClipboard', 'int32', ['void *']),
    closeClipboard: user32.func('CloseClipboard', 'int32', []),
    emptyClipboard: user32.func('EmptyClipboard', 'int32', []),
    setClipboardData: user32.func('SetClipboardData', 'void *', ['uint32', 'void *']),
    getClipboardData: user32.func('GetClipboardData', 'void *', ['uint32']),
    enumClipboardFormats: user32.func('EnumClipboardFormats', 'uint32', ['uint32']),
    registerFormat: user32.func('RegisterClipboardFormatW', 'uint32', ['str16']),
    clipboardOwner: user32.func('GetClipboardOwner', 'void *', []),
    globalAlloc: kernel32.func('GlobalAlloc', 'void *', ['uint32', 'uintptr_t']),
    globalLock: kernel32.func('GlobalLock', 'void *', ['void *']),
    globalUnlock: kernel32.func('GlobalUnlock', 'int32', ['void *']),
    globalSize: (memory) => Number(kernel32.func('GlobalSize', 'uintptr_t', ['void *'])(memory)),
    globalFree: kernel32.func('GlobalFree', 'void *', ['void *']),
    // Копией через RtlMoveMemory в память V8, а не koffi.view: Electron запрещает буферы поверх
    // чужой памяти, и такой вызов роняет главный процесс.
    read: (pointer, size) => {
      const bytes = new Uint8Array(size)

      moveMemory(bytes, pointer, size)

      return bytes
    },
    write: (pointer, bytes) => moveMemory(pointer, bytes, bytes.length),
    createWindow: (onMessage) => {
      // Процедура живёт, пока живёт IDE: окно не уничтожается, слот koffi не освобождается.
      const procedure = koffi.register(
        (window: unknown, message: number, wParam: Word, lParam: Word) =>
          onMessage(message, Number(wParam)) ? 0 : defWindowProc(window, message, wParam, lParam),
        koffi.pointer(WNDPROC),
      )
      const instance = moduleHandle(null)

      registerClass({
        cbSize: koffi.sizeof(WNDCLASSEXW),
        style: 0,
        lpfnWndProc: procedure,
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: instance,
        hIcon: null,
        hCursor: null,
        hbrBackground: null,
        lpszMenuName: null,
        lpszClassName: CLASS_NAME,
        hIconSm: null,
      })

      return createWindowEx(0, CLASS_NAME, null, 0, 0, 0, 0, 0, HWND_MESSAGE, null, instance, null)
    },
    focusResponds: (timeoutMs) => {
      const info: GuiThreadInfo = { cbSize: koffi.sizeof(GUITHREADINFO) }
      const window = guiThreadInfo(0, info)
        ? (info.hwndFocus ?? info.hwndActive ?? foregroundWindow())
        : foregroundWindow()

      if (!window) return Promise.resolve(true)

      return new Promise((resolve) => {
        sendMessageTimeout.async(
          window,
          WM_NULL,
          0,
          0,
          SMTO_ABORTIFHUNG,
          timeoutMs,
          [0],
          (error: unknown, answered: Word) => resolve(!error && Number(answered) !== 0),
        )
      })
    },
  }
}
