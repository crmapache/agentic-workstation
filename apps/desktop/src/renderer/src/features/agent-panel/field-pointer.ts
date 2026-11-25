import type { ChipOf } from './field-dom'

/**
 * Мышь в поле ввода. Chromium на macOS ставит каретку в самое начало текста, если нажать выше
 * первой строки, где бы по горизонтали ни нажали (так ведёт себя и NSTextView). Выше первой
 * строки в поле - его верхний отступ, полоса под рамкой: в неё попадают, целясь в конец первой
 * строки, и вставка или диктовка вставала в начало черновика. Такое нажатие поле берёт себе и
 * ставит каретку на первую строку под курсором.
 */

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** Верх первой строки - край содержимого поля с учётом прокрутки. */
const contentTop = (root: HTMLElement): number =>
  root.getBoundingClientRect().top +
  root.clientTop +
  parseFloat(getComputedStyle(root).paddingTop || '0') -
  root.scrollTop

/** Ребёнок поля, внутри которого лежит узел; сам корень - null. */
const childOf = (root: HTMLElement, node: Node): Node | null => {
  let current: Node | null = node

  while (current && current.parentNode !== root) current = current.parentNode

  return current
}

/**
 * Каретка под точкой - в координатах поля. Чип неделим: точка над ним встаёт с ближней
 * стороны чипа, а не внутрь его подписи. Точка не над полем - null.
 */
export const caretAtPoint = (
  root: HTMLElement,
  x: number,
  y: number,
  chipOf: ChipOf,
): Range | null => {
  const position = document.caretPositionFromPoint(x, y)

  if (!position || !root.contains(position.offsetNode)) return null

  const range = document.createRange()
  const node = position.offsetNode
  const child = node === root ? null : childOf(root, node)

  if (child instanceof HTMLElement && chipOf(child)) {
    const box = child.getBoundingClientRect()

    if (x < box.left + box.width / 2) range.setStartBefore(child)
    else range.setStartAfter(child)
  } else {
    range.setStart(node, position.offset)
  }

  range.collapse(true)

  return range
}

/**
 * Нажатие выше первой строки - место на первой строке под курсором. Ниже - null: строку,
 * пустое место под текстом (каретка в конец) и пустое поле браузер ставит правильно сам.
 */
export const caretAboveFirstLine = (
  root: HTMLElement,
  x: number,
  y: number,
  chipOf: ChipOf,
): Range | null => {
  const top = contentTop(root)

  if (y >= top || root.childNodes.length === 0) return null

  const lineHeight = parseFloat(getComputedStyle(root).lineHeight)
  const firstLine = top + (Number.isFinite(lineHeight) ? lineHeight / 2 : 1)

  return caretAtPoint(root, x, firstLine, chipOf)
}

/**
 * Протяжка выделения от нажатия, которое поле взяло себе: отменённое нажатие браузер не
 * тянет. Точка за краем поля прижимается к нему и прокручивает его, как у браузера; выше
 * первой строки выделение доходит до начала текста - это уже выделение, а не каретка.
 */
export const dragSelection = (root: HTMLElement, chipOf: ChipOf): void => {
  const stop = () => {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', stop)
  }

  const move = (event: MouseEvent) => {
    if ((event.buttons & 1) === 0) return stop()

    const box = root.getBoundingClientRect()

    if (event.clientY > box.bottom) root.scrollTop += event.clientY - box.bottom
    else if (event.clientY < box.top) root.scrollTop -= box.top - event.clientY

    const x = clamp(event.clientX, box.left, box.right - 1)
    const y = clamp(event.clientY, box.top, box.bottom - 1)
    const caret = caretAtPoint(root, x, y, chipOf)

    if (caret) window.getSelection()?.extend(caret.startContainer, caret.startOffset)
  }

  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', stop)
}
