import type { DraftChip, DraftToken } from '@shared/claude-draft'

/**
 * DOM поля ввода: текст и чипы одной лентой символов (как в ACC, composerDom). Это не
 * работа React: contentEditable правит браузер на каждую букву, а чипы - живые узлы,
 * за которыми стоят байты картинок. React их не видит; здесь всё, что читает поле,
 * пересобирает его и двигает каретку.
 */

/** Чей узел - по нему поле читает вложение обратно; не чип - undefined. */
export type ChipOf = (node: Node) => DraftChip | undefined

/** Новый узел чипа для поля. */
export type MakeChip = (chip: DraftChip) => HTMLElement

/**
 * Узел - в место свёрнутой каретки, без пустого текстового узла, который оставляет
 * Range.insertNode на краю текста: рядом с ним Chromium теряет набор иероглифа после
 * первой буквы («w我草» в ACC). Край не режется: в конце узла вставка встаёт после него,
 * в начале - перед, пустой узел заменяется; режется только середина.
 */
export const insertAtRange = (range: Range, node: Node): void => {
  const { startContainer: container, startOffset: offset } = range
  const parent = container.parentNode

  if (container instanceof Text && parent) {
    if (container.length === 0) parent.replaceChild(node, container)
    else if (offset >= container.length) parent.insertBefore(node, container.nextSibling)
    else if (offset === 0) parent.insertBefore(node, container)
    else range.insertNode(node)
  } else {
    range.insertNode(node)
  }

  range.setStartAfter(node)
  range.collapse(true)
}

/** Пустые текстовые узлы, оставленные удалением выделения перед вставкой, - прочь. */
export const dropEmptyText = (root: HTMLElement): void => {
  for (const node of Array.from(root.childNodes)) {
    if (node instanceof Text && node.length === 0) node.remove()
  }
}

const endRange = (root: HTMLElement): Range => {
  const range = document.createRange()

  range.selectNodeContents(root)
  range.collapse(false)

  return range
}

const endsWithBreak = (node: ChildNode | null): boolean =>
  node?.nodeType === Node.TEXT_NODE && (node.textContent ?? '').endsWith('\n')

/**
 * Пустой последней строке нужен запасной перенос: браузер её не рисует, и каретке негде
 * стоять - следующая буква встала бы перед переносом. Возвращает место перед запасным
 * переносом или null, если поле не кончается переносом.
 */
export const padTrailingBreak = (root: HTMLElement): Range | null => {
  const last = root.lastChild

  if (!last || last.nodeType !== Node.TEXT_NODE) return null

  const value = last.textContent ?? ''

  if (!value.endsWith('\n')) return null

  const padded = value.endsWith('\n\n') || (value === '\n' && endsWithBreak(last.previousSibling))

  if (!padded) last.textContent = `${value}\n`

  const range = document.createRange()

  range.setStart(last, padded ? value.length - 1 : value.length)
  range.collapse(true)

  return range
}

const select = (range: Range) => {
  const selection = window.getSelection()

  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Конец набранного - перед запасным переносом, если поле кончается переносом. */
export const fieldEnd = (root: HTMLElement): Range => padTrailingBreak(root) ?? endRange(root)

export const placeCaretAtEnd = (root: HTMLElement): void => select(fieldEnd(root))

/**
 * Клавиатура полю извне (смена вкладки, приветствие): каретка там, где её оставили, или в
 * конце черновика. Голый focus() при выделении где-то ещё ставит её в начало поля.
 */
export const takeKeyboard = (root: HTMLElement): void => {
  const caret = window.getSelection()?.anchorNode

  if (!caret || !root.contains(caret)) placeCaretAtEnd(root)

  root.focus()
}

/** Каретка рядом с чипом - с той стороны, куда шла стрелка. */
export const placeCaretBeside = (node: Node, side: 'before' | 'after'): void => {
  const range = document.createRange()

  if (side === 'before') range.setStartBefore(node)
  else range.setStartAfter(node)

  range.collapse(true)
  select(range)
}

/** Каретка перед ребёнком с этим номером - на месте вырезанного или подставленного. */
export const placeCaretBefore = (root: HTMLElement, index: number): void => {
  const node = root.childNodes[index]

  if (node) placeCaretBeside(node, 'before')
  else placeCaretAtEnd(root)
}

/**
 * Каретка в поле. Выделение ушло из поля (выделяли текст в ленте, жали кнопку) - место, где
 * каретку оставили (kept), свёрнутое к концу: прежнее выделение вставка не стирает. Не
 * оставляли - конец набранного (перед запасным переносом).
 */
export const currentRange = (root: HTMLElement, kept: Range | null = null): Range => {
  const selection = window.getSelection()
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  if (range && root.contains(range.startContainer)) return range

  if (kept?.startContainer.isConnected && root.contains(kept.startContainer)) {
    const caret = kept.cloneRange()

    caret.collapse(false)

    return caret
  }

  return fieldEnd(root)
}

/** Текст узла рядом с местом вставки; не текст (чип, <br>) или нет узла - пусто. */
const textOf = (node: Node | null | undefined): string =>
  node?.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : ''

/**
 * Символ перед свёрнутым диапазоном; вложение или начало поля - пусто. Смотрит и через край
 * узла, как в ACC: текст поля лежит в нескольких узлах, и на краю своего узла чип в начале строки
 * вставал вплотную к слову перед ним.
 */
export const charBefore = (range: Range): string => {
  const { startContainer: container, startOffset: offset } = range

  if (container.nodeType !== Node.TEXT_NODE)
    return textOf(container.childNodes[offset - 1]).slice(-1)
  if (offset > 0) return (container.textContent ?? '').charAt(offset - 1)

  return textOf(container.previousSibling).slice(-1)
}

/**
 * Символ после - так же, через край узла: иначе место сразу за вставленным чипом казалось пустым,
 * и чип посреди фразы приносил второй пробел к уже стоящему.
 */
export const charAfter = (range: Range): string => {
  const { startContainer: container, startOffset: offset } = range

  if (container.nodeType !== Node.TEXT_NODE) return textOf(container.childNodes[offset]).charAt(0)

  const text = container.textContent ?? ''

  return offset < text.length ? text.charAt(offset) : textOf(container.nextSibling).charAt(0)
}

/** Перед вложением пробел нужен, только если там не пробел и не начало поля. */
export const needsLeadingSpace = (char: string): boolean => char.length > 0 && !/\s/.test(char)

/**
 * После вложения пробел нужен всегда, как в ACC, - каретке надо где-то стоять, - но не второй.
 * Перевод строки за ним - не место для каретки: чип в конце строки перед следующей (или на новой
 * строке после Shift+Enter) оставался без пробела, и следующая буква липла к нему.
 */
export const needsTrailingSpace = (char: string): boolean => !/[^\S\r\n]/.test(char)

/**
 * Элемент поля, который не чип (блок или <br> самого браузера), - перенос строки и его
 * текст. Пустой - только перенос: Chromium ставит <br> вместо запасного переноса, и
 * пропущенный, он съедал строку человека. Ничего ещё не прочитано - пусто: пустое поле
 * в Chromium - одинокий <br>.
 */
export const blockText = (text: string, hasEarlier: boolean): string | null =>
  hasEarlier ? `\n${text}` : text || null

/** Запасной перенос под кареткой - разметка поля, а не сообщение. */
const withoutCaretLine = (tokens: DraftToken[]): DraftToken[] => {
  const last = tokens.at(-1)

  if (last?.kind !== 'text' || !last.value.endsWith('\n')) return tokens

  const value = last.value.slice(0, -1)

  return value ? [...tokens.slice(0, -1), { kind: 'text', value }] : tokens.slice(0, -1)
}

/** Поле обратно в куски - после каждой буквы и каждой правки. */
export const extractTokens = (root: HTMLElement, chipOf: ChipOf): DraftToken[] => {
  const tokens: DraftToken[] = []

  for (const node of Array.from(root.childNodes)) {
    const chip = chipOf(node)

    if (chip) {
      tokens.push({ kind: 'chip', chip })
      continue
    }

    const value =
      node.nodeType === Node.TEXT_NODE
        ? node.textContent || null
        : node instanceof HTMLElement
          ? blockText(node.textContent ?? '', tokens.length > 0)
          : null

    if (value !== null) tokens.push({ kind: 'text', value })
  }

  return withoutCaretLine(tokens)
}

/**
 * Можно ли ставить каретку в поле после пересборки: каретка в contentEditable уносит
 * фокус, а у поля имени, ответа на вопрос или выделенного в ленте его отнимать нельзя.
 */
const mayTakeCaret = (root: HTMLElement): boolean => {
  const focused = document.activeElement
  const selection = window.getSelection()
  const selectedOutside =
    selection !== null &&
    selection.rangeCount > 0 &&
    !selection.isCollapsed &&
    !root.contains(selection.anchorNode)

  if (focused && root.contains(focused)) return true

  return (
    !selectedOutside &&
    !(focused instanceof HTMLInputElement) &&
    !(focused instanceof HTMLTextAreaElement)
  )
}

/**
 * Пересобрать поле из кусков - только для правок кода (вкладка, отмена, подстановка), не
 * для набора. Запасной перенос ставится здесь фактом: сообщение его не несёт.
 */
export const rebuildDom = (
  root: HTMLElement,
  tokens: readonly DraftToken[],
  makeChip: MakeChip,
) => {
  root.replaceChildren(
    ...tokens.map((token) =>
      token.kind === 'text' ? document.createTextNode(token.value) : makeChip(token.chip),
    ),
  )

  const last = root.lastChild

  if (last?.nodeType === Node.TEXT_NODE && (last.textContent ?? '').endsWith('\n')) {
    last.textContent = `${last.textContent ?? ''}\n`
  }

  if (mayTakeCaret(root)) placeCaretAtEnd(root)
}
