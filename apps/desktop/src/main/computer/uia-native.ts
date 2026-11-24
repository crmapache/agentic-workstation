import type * as Koffi from 'koffi'

import type { Point } from './computer.types'
import { parseGuid } from './uia-element'
import type { UiaPort, UiaElementRef } from './uia-element'
import { GA_ROOT, PROCESS_QUERY_LIMITED_INFORMATION } from './win-input.constants'
import type { WinNative } from './win-native'
import { winStructs } from './win-structs'

/**
 * UI Automation Windows через koffi (ADR 0119): объект CUIAutomation и методы COM по их местам в
 * таблице. Места и GUID - из UIAutomationClient.h, сверены с include/uiautomationclient.idl Wine;
 * на живом Windows этот файл ещё не запускался, поэтому любой сбой - исключение, а не догадка:
 * выше оно становится «элемент не определён».
 */

const CLSID_CUI_AUTOMATION_8 = 'e22ad333-b25f-460c-83d0-0581107395c9'
const CLSID_CUI_AUTOMATION = 'ff48dba4-60ef-4201-aa87-54103eef594e'
const IID_IUI_AUTOMATION = '30cbe57d-d9d0-452a-ab13-7ac5ac4825ee'
const IID_IUI_AUTOMATION_2 = '34723aff-0c9d-49d0-9896-7ab52df8cd8a'

/** Места методов: у каждого интерфейса сначала три метода IUnknown, дальше - по объявлению. */
const VTABLE = {
  queryInterface: 0,
  release: 2,
  /** IUIAutomation. */
  elementFromPoint: 7,
  controlViewWalker: 14,
  /** IUIAutomation2 продолжает IUIAutomation (его последний метод - 57). */
  putConnectionTimeout: 61,
  putTransactionTimeout: 63,
  /** IUIAutomationTreeWalker. */
  parentElement: 3,
  /** IUIAutomationElement. */
  processId: 20,
  controlType: 21,
  name: 23,
} as const

const CLSCTX_INPROC_SERVER = 0x1
const COINIT_APARTMENTTHREADED = 0x2
const MAX_PATH = 260

/**
 * Предел ответа приложения, мс. Без него UI Automation ждёт зависшее приложение до 20 с, а вызов
 * идёт в главном потоке IDE.
 */
const TIMEOUT_MS = 1000

/**
 * Вызов метода объекта COM по месту в его таблице: первое поле объекта - адрес таблицы, в ней
 * адреса методов по порядку, первым аргументом метод получает сам объект. Ответ - HRESULT.
 */
export const comCall = (koffi: typeof Koffi) => {
  const size = koffi.sizeof('void *')

  return (self: unknown, index: number, proto: Koffi.TypeObject, ...args: unknown[]): number => {
    const table: unknown = koffi.decode(self, 'void *')

    return koffi.call(koffi.decode(table, index * size, 'void *'), proto, self, ...args) as number
  }
}

/**
 * Поднять UI Automation и отдать порт поиска (uia-element.ts). COM главного потока Electron уже
 * поднял сам: повторный CoInitializeEx отвечает S_FALSE или RPC_E_CHANGED_MODE, и это не ошибка.
 */
export const loadUiaPort = (win: () => WinNative): UiaPort => {
  const { koffi, POINT } = winStructs()
  const GUID = koffi.struct({
    Data1: 'uint32',
    Data2: 'uint16',
    Data3: 'uint16',
    Data4: koffi.array('uint8', 8),
  })
  const ole32 = koffi.load('ole32.dll')
  const oleaut32 = koffi.load('oleaut32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  const outPointer = koffi.out(koffi.pointer('void *'))
  const coInitialize = ole32.func('CoInitializeEx', 'int32', ['void *', 'uint32'])
  const coCreate = ole32.func('CoCreateInstance', 'int32', [
    koffi.pointer(GUID),
    'void *',
    'uint32',
    koffi.pointer(GUID),
    outPointer,
  ])
  const freeString = oleaut32.func('SysFreeString', 'void', ['void *'])
  const imageName = kernel32.func('QueryFullProcessImageNameW', 'int32', [
    'void *',
    'uint32',
    'void *',
    koffi.inout(koffi.pointer('uint32')),
  ])
  const protos = {
    release: koffi.proto('uint32', ['void *']),
    query: koffi.proto('int32', ['void *', koffi.pointer(GUID), outPointer]),
    fromPoint: koffi.proto('int32', ['void *', POINT, outPointer]),
    getPointer: koffi.proto('int32', ['void *', outPointer]),
    getInt: koffi.proto('int32', ['void *', koffi.out(koffi.pointer('int32'))]),
    putInt: koffi.proto('int32', ['void *', 'uint32']),
    parent: koffi.proto('int32', ['void *', 'void *', outPointer]),
  }
  const call = comCall(koffi)
  const release = (self: unknown) => call(self, VTABLE.release, protos.release)
  const failed = (what: string, result: number) =>
    new Error(`${what} failed: 0x${(result >>> 0).toString(16)}`)

  coInitialize(null, COINIT_APARTMENTTHREADED)

  const created: unknown[] = [null]
  const automation =
    coCreate(
      parseGuid(CLSID_CUI_AUTOMATION_8),
      null,
      CLSCTX_INPROC_SERVER,
      parseGuid(IID_IUI_AUTOMATION),
      created,
    ) >= 0 ||
    coCreate(
      parseGuid(CLSID_CUI_AUTOMATION),
      null,
      CLSCTX_INPROC_SERVER,
      parseGuid(IID_IUI_AUTOMATION),
      created,
    ) >= 0
      ? created[0]
      : null

  if (!automation) throw new Error('UI Automation is not available')

  // Пределы ответа - у IUIAutomation2 (Windows 8 и новее); нет его - ждём по умолчанию.
  const second: unknown[] = [null]

  if (
    call(
      automation,
      VTABLE.queryInterface,
      protos.query,
      parseGuid(IID_IUI_AUTOMATION_2),
      second,
    ) >= 0 &&
    second[0]
  ) {
    call(second[0], VTABLE.putConnectionTimeout, protos.putInt, TIMEOUT_MS)
    call(second[0], VTABLE.putTransactionTimeout, protos.putInt, TIMEOUT_MS)
    release(second[0])
  }

  const walked: unknown[] = [null]
  const walkerResult = call(automation, VTABLE.controlViewWalker, protos.getPointer, walked)

  if (walkerResult < 0 || !walked[0]) throw failed('ControlViewWalker', walkerResult)

  const walker = walked[0]

  const wrap = (element: unknown): UiaElementRef => ({
    controlType: () => {
      const out = [0]

      return call(element, VTABLE.controlType, protos.getInt, out) >= 0 ? (out[0] ?? 0) : 0
    },
    name: () => {
      const out: unknown[] = [null]

      if (call(element, VTABLE.name, protos.getPointer, out) < 0 || !out[0]) return ''

      try {
        return koffi.decode.string16(out[0])
      } finally {
        freeString(out[0])
      }
    },
    processId: () => {
      const out = [0]

      return call(element, VTABLE.processId, protos.getInt, out) >= 0 ? (out[0] ?? 0) : 0
    },
    parent: () => {
      const out: unknown[] = [null]

      return call(walker, VTABLE.parentElement, protos.parent, element, out) >= 0 && out[0]
        ? wrap(out[0])
        : null
    },
    release: () => {
      release(element)
    },
  })

  return {
    windowPid: (at: Point) => {
      const native = win()
      const window = native.windowFromPoint(at)

      if (!window) return 0

      const pid = [0]

      native.windowProcessId(native.ancestor(window, GA_ROOT) ?? window, pid)

      return pid[0] ?? 0
    },
    elementAt: (at: Point) => {
      const out: unknown[] = [null]
      const point = { x: Math.round(at.x), y: Math.round(at.y) }
      const result = call(automation, VTABLE.elementFromPoint, protos.fromPoint, point, out)

      if (result < 0) throw failed('ElementFromPoint', result)

      return out[0] ? wrap(out[0]) : null
    },
    appName: (pid: number) => {
      const native = win()
      const process = pid ? native.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) : null

      if (!process) return ''

      try {
        const buffer = Buffer.alloc(MAX_PATH * 2)
        const length = [MAX_PATH]

        if (!imageName(process, 0, buffer, length)) return ''

        const path = buffer.toString('utf16le', 0, (length[0] ?? 0) * 2)

        return (path.split('\\').at(-1) ?? '').replace(/\.exe$/i, '')
      } finally {
        native.closeHandle(process)
      }
    },
  }
}
