import { fullName, elementLabel, matchesExpect } from '../browser/expect-label'
import type { Point, InputDriver, ElementLookup, ScreenElement } from './computer.types'

/**
 * Что под точкой экрана словами (ADR 0119): разбор ответа доступности macOS (AX) и UI Automation
 * Windows в элемент для сверки клика и отказы проверки. Чистые функции - держит тест; узлы
 * приносят ax-element.ts и uia-element.ts.
 */

/** Узел доступности macOS: роль, подроль и то, чем его можно назвать. */
export type MacAxNode = {
  role: string
  subrole: string
  title: string
  description: string
  /** AXValue - только у ролей, чьё значение и есть подпись (namesByValue): у поля это его текст. */
  value: string
  /** Текст подписи рядом (AXTitleUIElement): так названы поля форм. */
  labelledBy: string
  /** Подсказка пустого поля (AXPlaceholderValue). */
  placeholder: string
}

/** Роли, у которых значение - подпись: текст, выбранный пункт списка, ячейка. */
const VALUE_NAMED = new Set(['AXStaticText', 'AXPopUpButton', 'AXMenuButton', 'AXCell'])

export const namesByValue = (role: string): boolean => VALUE_NAMED.has(role)

/** Роли macOS, у которых нажатие что-то делает. */
const MAC_ACTIONABLE = new Set([
  'AXButton',
  'AXMenuItem',
  'AXMenuBarItem',
  'AXMenuButton',
  'AXPopUpButton',
  'AXLink',
  'AXCheckBox',
  'AXRadioButton',
  'AXDisclosureTriangle',
  'AXComboBox',
  'AXTextField',
  'AXTextArea',
  'AXSlider',
  'AXIncrementor',
  'AXColorWell',
  'AXDockItem',
])

/** Действует ли элемент macOS с этой ролью по нажатию: выше по цепочке идти незачем. */
export const isMacActionable = (role: string): boolean => MAC_ACTIONABLE.has(role)

/** AXMenuBarItem → «menu bar item»: роль словами, как её поймёт модель. */
export const roleWords = (role: string): string =>
  role
    .replace(/^AX/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()

/**
 * Имя узла macOS: заголовок, описание, подпись рядом; значение - только у текста и списков (у поля
 * значение - то, что в нём набрано, а не его подпись); подсказка пустого поля - последней.
 */
const macName = (node: MacAxNode): string =>
  fullName(
    node.title ||
      node.description ||
      node.labelledBy ||
      (namesByValue(node.role) ? node.value : '') ||
      node.placeholder,
  )

/**
 * Элемент под точкой macOS по цепочке от попадания вверх (AXParent): ближайший действующий
 * (кнопка, пункт меню, ссылка, флажок, поле), иначе - само попадание. Цепочки нет - null.
 */
export const describeMacChain = (
  chain: readonly MacAxNode[],
  app: string,
): ScreenElement | null => {
  const actionable = chain.find((node) => MAC_ACTIONABLE.has(node.role))
  const shown = actionable ?? chain[0]

  if (!shown) return null

  const role = roleWords(shown.role)

  return {
    role: shown.subrole ? `${role} (${roleWords(shown.subrole)})` : role,
    name: macName(shown),
    app,
    isActionable: actionable !== undefined,
  }
}

/** Узел UI Automation: тип элемента (UIA_*ControlTypeId) и имя. */
export type UiaNode = { controlType: number; name: string }

/** Типы элементов UI Automation (UIAutomationClient.h) словами. */
const UIA_TYPES: Readonly<Record<number, string>> = {
  50000: 'button',
  50001: 'calendar',
  50002: 'check box',
  50003: 'combo box',
  50004: 'edit',
  50005: 'hyperlink',
  50006: 'image',
  50007: 'list item',
  50008: 'list',
  50009: 'menu',
  50010: 'menu bar',
  50011: 'menu item',
  50012: 'progress bar',
  50013: 'radio button',
  50014: 'scroll bar',
  50015: 'slider',
  50016: 'spinner',
  50017: 'status bar',
  50018: 'tab',
  50019: 'tab item',
  50020: 'text',
  50021: 'tool bar',
  50022: 'tool tip',
  50023: 'tree',
  50024: 'tree item',
  50025: 'custom',
  50026: 'group',
  50027: 'thumb',
  50028: 'data grid',
  50029: 'data item',
  50030: 'document',
  50031: 'split button',
  50032: 'window',
  50033: 'pane',
  50034: 'header',
  50035: 'header item',
  50036: 'table',
  50037: 'title bar',
  50038: 'separator',
}

/** Действующие типы UI Automation: кнопка, флажок, поле, ссылка, пункты списков и меню. */
const UIA_ACTIONABLE = new Set([
  50000, 50002, 50003, 50004, 50005, 50007, 50011, 50013, 50015, 50016, 50019, 50024, 50031,
])

/** То же для Windows: цепочка от ElementFromPoint вверх по дереву элементов управления. */
export const describeUiaChain = (chain: readonly UiaNode[], app: string): ScreenElement | null => {
  const actionable = chain.find((node) => UIA_ACTIONABLE.has(node.controlType))
  const shown = actionable ?? chain[0]

  if (!shown) return null

  return {
    role: UIA_TYPES[shown.controlType] ?? `control ${shown.controlType}`,
    name: fullName(shown.name),
    app,
    isActionable: actionable !== undefined,
  }
}

/** Элемент словами для модели: `button "7" in Calculator`. */
export const screenLabel = (element: ScreenElement): string => {
  const label = elementLabel(element.role, element.name)

  return element.app ? `${label} in ${element.app}` : label
}

/**
 * Почему нельзя жать в то, что под точкой; можно - null. С expect - имя должно совпасть целиком, а
 * элемент без имени или не определённый проверить нечем. Без expect - нельзя в действующий
 * элемент: подпись того, что модель хочет нажать, закрывает все «опасные» кнопки на всех языках
 * сразу. Не определённый элемент и действующий без имени (кнопка-значок без описания) без expect -
 * можно, как раньше: иначе его не нажать вовсе, а ответ скажет, что сверить было не с чем.
 */
export const clickRefusal = (lookup: ElementLookup, expect: string | undefined): string | null => {
  if (!lookup.element) {
    return expect === undefined
      ? null
      : `The element under the pointer can't be determined (${lookup.reason}), so "${expect}" can't be checked.`
  }

  const label = screenLabel(lookup.element)

  if (expect !== undefined) {
    if (!lookup.element.name) {
      return `Under the pointer is ${label}, which has no name, so "${expect}" can't be checked. Click it without expect if it is what you mean.`
    }

    return matchesExpect(lookup.element.name, expect)
      ? null
      : `Under the pointer is ${label}, not "${expect}".`
  }

  return lookup.element.isActionable && lookup.element.name
    ? `Under the pointer is ${label}. Buttons, menu items, links and fields need expect: the label of what you mean to click.`
    : null
}

/** Ответ клика: что нажато; без имени или не определено - с пометкой, что сверить было не с чем. */
export const clickedText = (lookup: ElementLookup, at: { x: number; y: number }): string => {
  if (!lookup.element) {
    return `Clicked at (${at.x}, ${at.y}); the element there could not be determined (${lookup.reason}).`
  }

  const { element } = lookup

  return element.isActionable && !element.name
    ? `Clicked ${screenLabel(element)}; it has no name, so the click could not be checked against a label.`
    : `Clicked ${screenLabel(element)}.`
}

const NO_LOOKUP = 'this system does not report what is on screen'

/**
 * Что под точкой. Система не умеет сказать или поиск сорвался - элемент не определён: без
 * expect клик идёт, как раньше, с expect - отказ (clickRefusal). Молча expect не теряется.
 */
export const elementUnder = (input: InputDriver, at: Point): ElementLookup => {
  if (!input.elementAt) return { element: null, reason: NO_LOOKUP }

  try {
    return input.elementAt(at)
  } catch (error) {
    console.warn('[computer] element lookup failed:', error)

    return { element: null, reason: 'the accessibility lookup failed' }
  }
}

/** Чем кончилось до отказа: ничего не нажато - или куда ушли первые нажатия двойного клика. */
export const pressedSoFar = (first: ElementLookup | null, sent: number): string => {
  if (first === null || sent === 0) return 'Nothing was clicked.'

  const where = first.element
    ? screenLabel(first.element)
    : 'an element that could not be determined'
  const clicks = sent === 1 ? 'The first click' : `The first ${sent} clicks`

  return `${clicks} went to ${where}; the rest of the clicks were not sent.`
}
