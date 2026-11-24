import { createRequire } from 'node:module'

import type * as Koffi from 'koffi'
import { it, expect, describe } from 'vitest'

import { parseGuid, createUiaFinder } from './uia-element'
import type { UiaPort, UiaElementRef } from './uia-element'
import { comCall } from './uia-native'

const OWN_PID = 4242

/** Элемент-подделка: тип, имя, процесс и родитель; освобождение записывается. */
const fakeElement = (
  released: string[],
  name: string,
  controlType: number,
  parent: UiaElementRef | null = null,
): UiaElementRef => ({
  controlType: () => controlType,
  name: () => name,
  processId: () => 900,
  parent: () => parent,
  release: () => released.push(name),
})

const finder = (port: Partial<UiaPort>, scale = 1) =>
  createUiaFinder(
    () => ({ windowPid: () => 900, elementAt: () => null, appName: () => 'OUTLOOK', ...port }),
    (at) => ({ x: at.x * scale, y: at.y * scale }),
    OWN_PID,
  )

describe('что под точкой Windows', () => {
  it('текст в кнопке - кнопка; выше действующего не идёт; каждый объект освобождён', () => {
    const released: string[] = []
    const window = fakeElement(released, 'Inbox', 50032)
    const button = fakeElement(released, 'Send', 50000, window)
    const text = fakeElement(released, 'Send', 50020, button)
    const asked: { x: number; y: number }[] = []
    const find = finder(
      {
        elementAt: (at) => {
          asked.push(at)

          return text
        },
      },
      1.5,
    )

    expect(find({ x: 100, y: 40 })).toEqual({
      element: { role: 'button', name: 'Send', app: 'OUTLOOK', isActionable: true },
    })
    // Точки - пиксели экрана: с масштабом 150% DIP переводится до вызова системы.
    expect(asked).toEqual([{ x: 150, y: 60 }])
    expect(released).toEqual(['Send', 'Send'])
  })

  it('окно самой IDE - не определено, систему не спрашивает', () => {
    let asked = false
    const find = finder({
      windowPid: () => OWN_PID,
      elementAt: () => {
        asked = true

        return null
      },
    })

    expect(find({ x: 1, y: 1 })).toMatchObject({ element: null, reason: /Agentic Workstation/ })
    expect(asked).toBe(false)
  })

  it('под точкой ничего - не определено с причиной; сбой системы - исключение наверх', () => {
    expect(finder({})({ x: 1, y: 1 })).toEqual({
      element: null,
      reason: 'nothing there reports itself to UI Automation',
    })
    expect(() =>
      finder({
        elementAt: () => {
          throw new Error('ElementFromPoint failed: 0x80004005')
        },
      })({ x: 1, y: 1 }),
    ).toThrow('0x80004005')
  })
})

describe('GUID', () => {
  it('строкой из заголовка - полями структуры', () => {
    expect(parseGuid('ff48dba4-60ef-4201-aa87-54103eef594e')).toEqual({
      Data1: 0xff48dba4,
      Data2: 0x60ef,
      Data3: 0x4201,
      Data4: [0xaa, 0x87, 0x54, 0x10, 0x3e, 0xef, 0x59, 0x4e],
    })
    expect(() => parseGuid('nope')).toThrow('Not a GUID')
  })
})

// Механика COM на любой системе: таблица методов из своих функций koffi, вызов по месту - так
// же, как uia-native.ts зовёт ElementFromPoint и тип элемента.
describe('вызов метода COM по месту в таблице', () => {
  it('отдаёт объект первым аргументом, точку - по значению, ответ - в выходной указатель', () => {
    const koffi = createRequire(import.meta.url)('koffi') as typeof Koffi
    const POINT = koffi.struct({ x: 'int32', y: 'int32' })
    const fromPoint = koffi.proto('int32', ['void *', POINT, koffi.out(koffi.pointer('void *'))])
    const getInt = koffi.proto('int32', ['void *', koffi.out(koffi.pointer('int32'))])
    const size = koffi.sizeof('void *')
    const seen: unknown[] = []
    const onPoint = koffi.register((self: unknown, point: unknown, out: unknown) => {
      seen.push(point)
      koffi.encode(out, 'void *', self)

      return 0
    }, koffi.pointer(fromPoint))
    const onType = koffi.register((_self: unknown, out: unknown) => {
      koffi.encode(out, 'int32', 50000)

      return 0
    }, koffi.pointer(getInt))
    const table: unknown = koffi.alloc('void *', 25)
    const object: unknown = koffi.alloc('void *', 1)

    try {
      koffi.encode(table, 7 * size, 'void *', onPoint)
      koffi.encode(table, 21 * size, 'void *', onType)
      koffi.encode(object, 'void *', table)

      const call = comCall(koffi)
      const found: unknown[] = [null]
      const type = [0]

      expect(call(object, 7, fromPoint, { x: 150, y: 60 }, found)).toBe(0)
      expect(seen).toEqual([{ x: 150, y: 60 }])
      expect(koffi.address(found[0])).toBe(koffi.address(object))
      expect(call(object, 21, getInt, type)).toBe(0)
      expect(type[0]).toBe(50000)
    } finally {
      koffi.unregister(onPoint)
      koffi.unregister(onType)
      koffi.free(table)
      koffi.free(object)
    }
  })
})
