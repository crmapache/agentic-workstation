import type { Point, ElementLookup } from './computer.types'
import { describeUiaChain } from './screen-element'
import type { UiaNode } from './screen-element'

/**
 * Что под точкой экрана Windows (ADR 0119) - UI Automation, тот же контракт, что доступность
 * macOS (ax-element.ts). Здесь - обход без системы: попадание и его предки до ближайшего
 * действующего, освобождение каждого объекта COM; вызовы самой системы - uia-native.ts. Живой
 * Windows для проверки нет, поэтому при любом сбое - строго: элемент не определён (с expect -
 * отказ, без него - клик с пометкой).
 */

/** Элемент UI Automation (IUIAutomationElement) без подробностей COM. */
export type UiaElementRef = {
  controlType: () => number
  name: () => string
  processId: () => number
  /** Родитель в дереве элементов управления; нет - null. */
  parent: () => UiaElementRef | null
  release: () => void
}

/** Что нужно от Windows: точки - пиксели экрана. */
export type UiaPort = {
  /** pid процесса верхнего окна под точкой (WindowFromPoint); не узнать - 0. */
  windowPid: (at: Point) => number
  /** Элемент под точкой (ElementFromPoint); нет - null, сбой системы - исключение. */
  elementAt: (at: Point) => UiaElementRef | null
  /** Имя приложения процесса: имя его exe без расширения. */
  appName: (pid: number) => string
}

/** Выше по дереву не идём: действующий предок кнопки - в паре шагов. */
const MAX_DEPTH = 10

const OWN_WINDOW =
  'it is a window of Agentic Workstation itself, which UI Automation cannot read from the IDE'

/**
 * Поиск элемента под точкой экрана Windows. Окно самой IDE - не определено без вызова системы:
 * UI Automation из главного потока в свои же окна может повиснуть. Окна, сквозь которые проходят
 * клики (стрелка ИИ, капсула во время клика под ней), WindowFromPoint и ElementFromPoint
 * пропускают сами, как и клик.
 */
export const createUiaFinder =
  (port: () => UiaPort, toPixels: (at: Point) => Point, ownPid: number) =>
  (at: Point): ElementLookup => {
    const native = port()
    const pixels = toPixels(at)

    if (native.windowPid(pixels) === ownPid) return { element: null, reason: OWN_WINDOW }

    const hit = native.elementAt(pixels)

    if (!hit) return { element: null, reason: 'nothing there reports itself to UI Automation' }

    const owned: UiaElementRef[] = [hit]

    try {
      const chain: UiaNode[] = []

      for (let element = hit, depth = 0; depth < MAX_DEPTH; depth += 1) {
        const node = { controlType: element.controlType(), name: element.name() }

        chain.push(node)

        if (describeUiaChain([node], '')?.isActionable) break

        const parent = element.parent()

        if (!parent) break

        owned.push(parent)
        element = parent
      }

      const element = describeUiaChain(chain, native.appName(hit.processId()))

      return element ? { element } : { element: null, reason: 'the app names nothing there' }
    } finally {
      for (const element of owned) element.release()
    }
  }

/** GUID строкой (как в заголовках Windows) - полями структуры GUID. */
export const parseGuid = (text: string) => {
  const hex = text.replace(/-/g, '')

  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`Not a GUID: ${text}`)

  return {
    Data1: Number.parseInt(hex.slice(0, 8), 16),
    Data2: Number.parseInt(hex.slice(8, 12), 16),
    Data3: Number.parseInt(hex.slice(12, 16), 16),
    Data4: Array.from({ length: 8 }, (_, index) =>
      Number.parseInt(hex.slice(16 + index * 2, 18 + index * 2), 16),
    ),
  }
}
