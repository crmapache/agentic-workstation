import type { DraftChip } from '@shared/claude-draft'

/** Живой чип в поле: узел и что за ним стоит. Внутренности рисует React порталом. */
export type LiveChip = { id: string; node: HTMLElement; chip: DraftChip }

/** Пробел, который поле ставит после чипа, или его неразрывная замена от Chromium. */
const SPACE_AFTER_CHIP = /^[ \u00a0]$/

/** Чем чип выглядит для соседнего символа - не пробел. */
const CHIP_CHAR = '\ufffc'

/**
 * Уходит ли пробел вместе с удалённым чипом: да, если с одной из сторон край - начало
 * поля или строки, конец, пробел. Между двумя словами остаётся - иначе они слипнутся.
 */
export const spaceGoesWithChip = (before: string, after: string): boolean => {
  const edge = (char: string) => char === '' || /\s/.test(char)

  return edge(before) || edge(after)
}

/**
 * Чипы поля: узел ↔ вложение. Узел - простой DOM (React не делит contentEditable с
 * браузером), его содержимое (подпись, ×, «развернуть») рисует React порталом в этот
 * узел - так у чипа те же иконки и подсказки, что у всей панели.
 */
export class ChipRegistry {
  private readonly chips = new WeakMap<Node, LiveChip>()
  private live: LiveChip[] = []
  private serial = 0
  private readonly listeners = new Set<() => void>()

  constructor(private readonly className: string) {}

  readonly chipOf = (node: Node): DraftChip | undefined => this.chips.get(node)?.chip

  /** Новый узел чипа: неделимый, с видом в атрибуте - по нему свой цвет. */
  readonly make = (chip: DraftChip): HTMLElement => {
    const node = document.createElement('span')

    this.serial += 1
    node.className = this.className
    node.contentEditable = 'false'
    node.dataset['kind'] = chip.kind

    const entry = { id: `chip-${this.serial}`, node, chip }

    this.chips.set(node, entry)
    this.live = [...this.live, entry]
    this.changed()

    return node
  }

  /** Вложение за узлом поменялось (номер картинки, путь на диске). */
  update(node: Node, chip: DraftChip): void {
    const entry = this.chips.get(node)

    if (!entry) return

    const next = { ...entry, chip }

    this.chips.set(node, next)
    this.live = this.live.map((item) => (item === entry ? next : item))
    this.changed()
  }

  /** Чипы, которые ещё стоят в поле: удалённые браузером уходят из списка порталов. */
  snapshot = (): LiveChip[] => this.live

  /** Поле поменялось: убрать из порталов чипы, которых в нём больше нет. */
  prune(): void {
    const kept = this.live.filter((entry) => entry.node.isConnected)

    if (kept.length === this.live.length) return

    this.live = kept
    this.changed()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  private changed() {
    for (const listener of this.listeners) listener()
  }
}

/** Символ соседа со стороны чипа: текст, заменитель чипа или перенос (<br> браузера). */
const edgeChar = (
  node: Node | null,
  side: 'first' | 'last',
  isChip: (node: Node) => boolean,
): string => {
  if (!node) return ''

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''

    if (!text)
      return edgeChar(side === 'last' ? node.previousSibling : node.nextSibling, side, isChip)

    return side === 'last' ? text.charAt(text.length - 1) : text.charAt(0)
  }

  return isChip(node) ? CHIP_CHAR : '\n'
}

/**
 * Убрать чип из поля - одна дорога для × и Backspace по подсвеченному чипу. Сообщается
 * обычным событием input: чтение поля после правки и есть место, где поле
 * приводится в порядок.
 */
export const removeChip = (root: HTMLElement, node: HTMLElement, registry: ChipRegistry): void => {
  const isChip = (item: Node) => registry.chipOf(item) !== undefined
  const next = node.nextSibling

  if (next instanceof Text && SPACE_AFTER_CHIP.test(next.data.charAt(0))) {
    const after =
      next.data.length > 1 ? next.data.charAt(1) : edgeChar(next.nextSibling, 'first', isChip)

    if (spaceGoesWithChip(edgeChar(node.previousSibling, 'last', isChip), after)) {
      if (next.data.length === 1) next.remove()
      else next.deleteData(0, 1)
    }
  }

  node.remove()
  root.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Свёрнутую вставку - обратно обычным текстом, тем же путём, что удаление. */
export const expandChip = (root: HTMLElement, node: HTMLElement, text: string): void => {
  node.replaceWith(document.createTextNode(text))
  root.normalize()
  root.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Номера картинок - по их месту в поле, с base: номер на чипе должен совпасть с
 * [Image #N], который увидит модель. true - что-то поменялось.
 */
export const relabelImages = (root: HTMLElement, base: number, registry: ChipRegistry): boolean => {
  let ordinal = base
  let changed = false

  for (const node of Array.from(root.childNodes)) {
    const chip = registry.chipOf(node)

    if (!chip || chip.kind !== 'img' || !chip.data) continue

    ordinal += 1

    const value = `Image #${ordinal}`

    if (chip.value === value) continue

    registry.update(node, { ...chip, value })
    changed = true
  }

  return changed
}

/**
 * Номера цитат из ленты (ref1, ref2…) - по их месту в поле, как их пронумерует и лента
 * отправленного сообщения: цитату могли вставить перед уже вставленной. Модели номер не
 * уходит - только подпись чипа. true - что-то поменялось.
 */
export const relabelQuotes = (root: HTMLElement, registry: ChipRegistry): boolean => {
  let ordinal = 0
  let changed = false

  for (const node of Array.from(root.childNodes)) {
    const chip = registry.chipOf(node)

    if (chip?.kind !== 'quote') continue

    ordinal += 1

    const value = `ref${ordinal}`

    if (chip.value === value) continue

    registry.update(node, { ...chip, value })
    changed = true
  }

  return changed
}

/** Куда записались байты вставленной картинки - на её чип в поле (по байтам, не по месту). */
export const notePastedPath = (
  root: HTMLElement,
  data: string,
  path: string,
  registry: ChipRegistry,
): boolean => {
  let changed = false

  for (const node of Array.from(root.childNodes)) {
    const chip = registry.chipOf(node)

    if (chip?.kind !== 'img' || chip.data !== data || chip.path === path) continue

    registry.update(node, { ...chip, path })
    changed = true
  }

  return changed
}
