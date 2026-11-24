import { createRequire } from 'node:module'

import type * as Koffi from 'koffi'

import { CORE_FOUNDATION_PATH, APPLICATION_SERVICES_PATH } from './cg-events.constants'
import type { Point, ElementLookup } from './computer.types'
import { namesByValue, isMacActionable, describeMacChain } from './screen-element'
import type { MacAxNode } from './screen-element'

/**
 * Что под точкой экрана мака (ADR 0119) - через доступность macOS (AX), как CoreGraphics в
 * cg-events.ts: koffi, загрузка на первом вызове. Разрешение то же, «Универсальный доступ».
 *
 * Поиск - системный (AXUIElementCreateSystemWide): он бьёт так же, как клик, - мимо окон, которые
 * пропускают мышь сквозь себя (стрелка ИИ, капсула во время клика под ней, прозрачное окно Dock
 * во весь экран), и находит строку меню и Dock. Вызовы - синхронно в главном потоке: доступность
 * собственных окон IDE отвечает прямо в вызове, а из фонового потока (koffi async) Electron падает.
 */

type Ref = unknown

type AxNative = {
  systemWide: Ref
  application: (pid: number) => Ref
  elementAt: (from: Ref, x: number, y: number, found: Ref[]) => number
  attribute: (element: Ref, name: Ref, value: Ref[]) => number
  pidOf: (element: Ref, pid: number[]) => number
  /** CFString по имени: имена атрибутов AX - строки вида «AXRole». */
  key: (name: string) => Ref
  /** Текст CFString; не строка - пусто. */
  text: (ref: Ref) => string
  release: (ref: Ref) => void
}

const UTF8 = 0x08000100

/** AXError (AXError.h). */
const AX_SUCCESS = 0
const AX_CANNOT_COMPLETE = -25204
const AX_API_DISABLED = -25211
const AX_NO_VALUE = -25212

/**
 * Сколько ждать ответа приложения. Без предела AX ждёт зависшее приложение 6 с, а вызов идёт в
 * главном потоке IDE. Ответы приложений на этом маке - 0.1-40 мс (замер в ADR 0119).
 */
const TIMEOUT_S = 0.5

/** Выше по цепочке AXParent не идём: действующий предок кнопки - в паре шагов. */
const MAX_DEPTH = 10

const loadAx = (): AxNative => {
  const koffi = createRequire(import.meta.url)('koffi') as typeof Koffi
  const ax = koffi.load(APPLICATION_SERVICES_PATH)
  const cf = koffi.load(CORE_FOUNDATION_PATH)
  const createString = cf.func(
    'void *CFStringCreateWithCString(void *alloc, const char *text, uint32_t encoding)',
  )
  const length = cf.func('long CFStringGetLength(void *text)')
  const copyText = cf.func(
    'bool CFStringGetCString(void *text, _Out_ uint8_t *buffer, long size, uint32_t encoding)',
  )
  const typeOf = cf.func('unsigned long CFGetTypeID(void *ref)')
  const stringType = Number(cf.func('unsigned long CFStringGetTypeID()')())
  const systemWide: Ref = ax.func('void *AXUIElementCreateSystemWide()')()
  const keys = new Map<string, Ref>()

  // Предел на системном элементе - общий для всех элементов процесса.
  ax.func('int32_t AXUIElementSetMessagingTimeout(void *element, float seconds)')(
    systemWide,
    TIMEOUT_S,
  )

  return {
    systemWide,
    application: ax.func('void *AXUIElementCreateApplication(int32_t pid)'),
    elementAt: ax.func(
      'int32_t AXUIElementCopyElementAtPosition(void *element, float x, float y, _Out_ void **found)',
    ),
    attribute: ax.func(
      'int32_t AXUIElementCopyAttributeValue(void *element, void *name, _Out_ void **value)',
    ),
    pidOf: ax.func('int32_t AXUIElementGetPid(void *element, _Out_ int32_t *pid)'),
    key: (name) => {
      const known = keys.get(name)

      if (known) return known

      const created: Ref = createString(null, name, UTF8)

      keys.set(name, created)

      return created
    },
    text: (ref) => {
      if (!ref || Number(typeOf(ref)) !== stringType) return ''

      const size = Number(length(ref)) * 4 + 1
      const buffer = Buffer.alloc(size)

      return copyText(ref, buffer, size, UTF8)
        ? buffer.toString('utf8', 0, Math.max(0, buffer.indexOf(0)))
        : ''
    },
    release: cf.func('void CFRelease(void *ref)'),
  }
}

let native: AxNative | null = null

const loaded = (): AxNative => (native ??= loadAx())

/** Строковый атрибут элемента; нет или не строка - пусто. */
const textOf = (lib: AxNative, element: Ref, name: string): string => {
  const value: Ref[] = [null]

  if (lib.attribute(element, lib.key(name), value) !== AX_SUCCESS || !value[0]) return ''

  try {
    return lib.text(value[0])
  } finally {
    lib.release(value[0])
  }
}

/** Подпись рядом (AXTitleUIElement): текст или заголовок того элемента. */
const labelOf = (lib: AxNative, element: Ref): string => {
  const label: Ref[] = [null]

  if (lib.attribute(element, lib.key('AXTitleUIElement'), label) !== AX_SUCCESS || !label[0]) {
    return ''
  }

  try {
    return textOf(lib, label[0], 'AXValue') || textOf(lib, label[0], 'AXTitle')
  } finally {
    lib.release(label[0])
  }
}

/**
 * Узел для имени: роль, подроль, заголовок, описание - и дальше, только если имени ещё нет.
 * AXValue - лишь у ролей, где оно и есть подпись: у поля или документа это весь его текст, и он
 * шёл бы по связи с приложением в главном потоке на каждое нажатие.
 */
const nodeOf = (lib: AxNative, element: Ref): MacAxNode => {
  const role = textOf(lib, element, 'AXRole')
  const node: MacAxNode = {
    role,
    subrole: textOf(lib, element, 'AXSubrole'),
    title: textOf(lib, element, 'AXTitle'),
    description: textOf(lib, element, 'AXDescription'),
    value: '',
    labelledBy: '',
    placeholder: '',
  }

  if (node.title || node.description) return node

  node.labelledBy = labelOf(lib, element)
  node.value = !node.labelledBy && namesByValue(role) ? textOf(lib, element, 'AXValue') : ''
  node.placeholder = node.labelledBy || node.value ? '' : textOf(lib, element, 'AXPlaceholderValue')

  return node
}

/** Имя приложения элемента: заголовок его AXApplication. */
const appOf = (lib: AxNative, element: Ref): string => {
  const pid = [0]

  if (lib.pidOf(element, pid) !== AX_SUCCESS || !pid[0]) return ''

  const application = lib.application(pid[0])

  try {
    return textOf(lib, application, 'AXTitle')
  } finally {
    lib.release(application)
  }
}

const reasonOf = (error: number): string => {
  if (error === AX_NO_VALUE) return 'nothing there reports itself to accessibility'
  if (error === AX_CANNOT_COMPLETE) return 'the app there did not answer in time'
  if (error === AX_API_DISABLED) return 'accessibility access is off'

  return `macOS accessibility error ${error}`
}

/**
 * Элемент под точкой экрана (точки macOS, как у CGEvent): попадание и его предки до ближайшего
 * действующего, имя приложения. Каждый полученный от AX объект освобождается.
 */
export const macElementAt = (at: Point): ElementLookup => {
  const lib = loaded()
  const found: Ref[] = [null]
  const error = lib.elementAt(lib.systemWide, at.x, at.y, found)
  const hit = found[0]

  if (error !== AX_SUCCESS || !hit) return { element: null, reason: reasonOf(error) }

  const owned: Ref[] = [hit]

  try {
    const chain: MacAxNode[] = []

    for (let element: Ref = hit, depth = 0; depth < MAX_DEPTH; depth += 1) {
      const node = nodeOf(lib, element)

      if (node.role === 'AXApplication') break

      chain.push(node)

      if (isMacActionable(node.role)) break

      const parent: Ref[] = [null]

      if (lib.attribute(element, lib.key('AXParent'), parent) !== AX_SUCCESS || !parent[0]) break

      owned.push(parent[0])
      element = parent[0]
    }

    const element = describeMacChain(chain, appOf(lib, hit))

    return element ? { element } : { element: null, reason: 'the app names nothing there' }
  } finally {
    for (const ref of owned) lib.release(ref)
  }
}
