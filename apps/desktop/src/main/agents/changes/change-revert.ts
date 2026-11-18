import type { TextLines } from './text-lines'
import { joinText, sameLines, splitText } from './text-lines'

/**
 * Ханк правки, как его прислал CLI (`structuredPatch`) или посчитал line-diff: строки
 * с пометками `+`, `-`, ` `. Начала (с 1) говорят только, где искать сначала - файл
 * мог сдвинуться.
 */
export type EditHunk = { oldStart: number; newStart: number; lines: string[] }

/** Одна правка хода в файле: создание текстом (Write) или применённые ханки. */
export type FileEdit = { kind: 'create'; content: string } | { kind: 'patch'; hunks: EditHunk[] }

/** Чем кончилось снятие или повтор правок: новый текст, удалить файл или «строки уже не те». */
export type EditResult = { kind: 'text'; text: string } | { kind: 'delete' } | { kind: 'changed' }

const CHANGED: EditResult = { kind: 'changed' }

/** Контекст ханка с каждой стороны правки - у CLI и у line-diff одинаковый. */
const CONTEXT = 3

/** Две стороны ханка (до и после, контекст в обеих) и как каждая кончается. */
type Sides = {
  before: string[]
  after: string[]
  beforeEndsBare: boolean
  afterEndsBare: boolean
  /** Контекста перед правкой меньше полного: ханк начинается с начала файла. */
  atTop: boolean
  /** Контекста после правки меньше полного: ханк кончается в конце файла. */
  atBottom: boolean
}

const sidesOf = (lines: readonly string[]): Sides => {
  const sides: Sides = {
    before: [],
    after: [],
    beforeEndsBare: false,
    afterEndsBare: false,
    atTop: false,
    atBottom: false,
  }
  let last = ' '
  let lead = 0
  let trail = 0
  let changed = false

  for (const raw of lines) {
    // «\ No newline at end of file» - пометка о строке выше, а не строка.
    if (raw.startsWith('\\')) {
      if (last === '-' || last === ' ') sides.beforeEndsBare = true
      if (last === '+' || last === ' ') sides.afterEndsBare = true
      continue
    }

    const mark = raw.charAt(0) || ' '
    const body = raw.slice(1).replace(/\r$/, '')

    if (mark !== '+') sides.before.push(body)
    if (mark !== '-') sides.after.push(body)

    if (mark === '+' || mark === '-') {
      changed = true
      trail = 0
    } else if (changed) {
      trail += 1
    } else {
      lead += 1
    }

    last = mark
  }

  sides.atTop = lead < CONTEXT
  sides.atBottom = trail < CONTEXT

  return sides
}

const matches = (lines: readonly string[], block: readonly string[], at: number) =>
  block.every((line, index) => lines[at + index] === line)

/** Где block стоит в lines ближе всего к expected (с 0), или null - нигде. */
const find = (lines: readonly string[], block: readonly string[], expected: number) => {
  const last = lines.length - block.length

  if (last < 0) return null

  const start = Math.min(Math.max(expected, 0), last)

  for (let distance = 0; distance <= Math.max(start, last - start); distance += 1) {
    if (start - distance >= 0 && matches(lines, block, start - distance)) return start - distance
    if (start + distance <= last && matches(lines, block, start + distance)) return start + distance
  }

  return null
}

/**
 * Где ханк приложится. anchored - ханк с неполным контекстом обязан и сейчас касаться
 * края файла: без этого строка агента в конце файла, переписанная руками, читалась бы
 * как уже откаченная - контекст перед ней на месте, только уже не последний.
 */
const locate = (lines: readonly string[], found: string[], start: number, sides: Sides | null) => {
  if (sides?.atTop && sides.atBottom) return sameLines(found, lines) ? 0 : null
  if (sides?.atTop) return found.length <= lines.length && matches(lines, found, 0) ? 0 : null

  if (sides?.atBottom) {
    const at = lines.length - found.length

    return at >= 0 && matches(lines, found, at) ? at : null
  }

  if (found.length === 0) return Math.min(Math.max(start, 0), lines.length)

  return find(lines, found, start - 1)
}

/**
 * Одна правка назад (снять) или вперёд (сделать снова): ханки с последнего, чтобы
 * сделанные не сдвигали место следующих. Ханк ищется там, где был, и дальше вширь -
 * выше могли добавиться строки.
 */
const applyPatch = (
  text: TextLines,
  hunks: readonly EditHunk[],
  forward: boolean,
  anchored: boolean,
): TextLines | null => {
  let { lines, endsWithBreak } = text

  for (const hunk of [...hunks].reverse()) {
    const sides = sidesOf(hunk.lines)
    const found = forward ? sides.before : sides.after
    const put = forward ? sides.after : sides.before
    const start = forward ? hunk.oldStart : hunk.newStart
    const at = locate(lines, found, start, anchored ? sides : null)

    if (at === null) return null

    // Только ханк, дошедший до конца файла, говорит, чем файл кончается.
    if (at + found.length === lines.length) {
      endsWithBreak = !(forward ? sides.afterEndsBare : sides.beforeEndsBare)
    }

    lines = [...lines.slice(0, at), ...put, ...lines.slice(at + found.length)]
  }

  return { lines, endsWithBreak }
}

/**
 * current с правками хода, снятыми с последней. Созданный файл - «удалить», если в нём
 * всё ещё ровно то, что оставил ход; строк хода нет на месте - changed.
 */
export const undoEdits = (
  current: string,
  edits: readonly FileEdit[],
  anchored = false,
): EditResult => {
  let text = splitText(current)

  for (const edit of [...edits].reverse()) {
    if (edit.kind === 'create') {
      return sameLines(text.lines, splitText(edit.content).lines) ? { kind: 'delete' } : CHANGED
    }

    const next = applyPatch(text, edit.hunks, false, anchored)

    if (!next) return CHANGED

    text = next
  }

  return { kind: 'text', text: joinText(text) }
}

/**
 * Правки хода снова, с первой - поверх current или поверх пустоты, если файла нет
 * (тогда первая правка обязана его создать). На месте созданного стоит что-то не ровно
 * то, что оставил ход, - это чужой файл, его не переписываем.
 */
export const redoEdits = (
  current: string | null,
  edits: readonly FileEdit[],
  anchored = false,
): EditResult => {
  const [first, ...rest] = edits

  if (!first) return CHANGED

  if (first.kind === 'create' && current !== null) {
    const made = redoEdits(null, edits, anchored)

    return made.kind === 'text' && sameLines(splitText(current).lines, splitText(made.text).lines)
      ? { kind: 'text', text: current }
      : CHANGED
  }

  if (current === null && first.kind !== 'create') return CHANGED

  let text = splitText(current ?? (first.kind === 'create' ? first.content : ''))

  for (const edit of current === null ? rest : edits) {
    // Второе создание за ход - файл заменён целиком, построчно это не повторить.
    if (edit.kind === 'create') return CHANGED

    const next = applyPatch(text, edit.hunks, true, anchored)

    if (!next) return CHANGED

    text = next
  }

  return { kind: 'text', text: joinText(text) }
}

/**
 * Нажатие «откатить»: снять правки, а если строк хода нет, но на их месте строки, которые
 * ход заменил, - файл уже откачен, писать нечего. Без этого перезапущенная IDE, забывшая
 * отметку, отвечала бы «changed» про файл, стоящий ровно там, куда его поставил человек.
 */
export const revertText = (current: string, edits: readonly FileEdit[]): EditResult => {
  const undone = undoEdits(current, edits)

  if (undone.kind !== 'changed') return undone
  // Созданный файл, который всё ещё на месте, откаченным не бывает: его откат - его отсутствие.
  if (edits[0]?.kind === 'create') return CHANGED

  return redoEdits(current, edits, true).kind === 'text' ? { kind: 'text', text: current } : CHANGED
}

/** Нажатие «вернуть»: сделать правки снова, а если они уже стоят - писать нечего. */
export const bringBackText = (current: string | null, edits: readonly FileEdit[]): EditResult => {
  const redone = redoEdits(current, edits)

  if (redone.kind !== 'changed' || current === null) return redone

  return undoEdits(current, edits, true).kind === 'changed'
    ? CHANGED
    : { kind: 'text', text: current }
}
