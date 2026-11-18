import type { EditHunk } from './change-revert'
import { MAX_DIFF_EDITS, MAX_DIFF_LINES, DIFF_WORK_BUDGET } from './changes.constants'
import type { TextLines } from './text-lines'
import { splitText } from './text-lines'

/** Кусок, который различается: строки [oldFrom, oldTo) старого текста стали [newFrom, newTo). */
type Block = { oldFrom: number; oldTo: number; newFrom: number; newTo: number }

const CONTEXT = 3

const NO_BREAK = '\\ No newline at end of file'

/**
 * Кратчайший путь правок по Майерсу между a и b (строки - числами), куски различий.
 * Правок больше, чем позволяет бюджет, - null: тогда середина идёт одним куском.
 */
const myersBlocks = (a: readonly number[], b: readonly number[], maxEdits: number) => {
  const offset = maxEdits + 1
  const frontier = new Int32Array(2 * maxEdits + 3)
  const trace: Int32Array[] = []

  for (let d = 0; d <= maxEdits; d += 1) {
    trace.push(frontier.slice(offset - d - 1, offset + d + 2))

    for (let k = -d; k <= d; k += 2) {
      const down =
        k === -d || (k !== d && (frontier[offset + k - 1] ?? 0) < (frontier[offset + k + 1] ?? 0))
      let x = down ? (frontier[offset + k + 1] ?? 0) : (frontier[offset + k - 1] ?? 0) + 1
      let y = x - k

      while (x < a.length && y < b.length && a[x] === b[y]) {
        x += 1
        y += 1
      }

      frontier[offset + k] = x

      if (x >= a.length && y >= b.length) return backtrack(trace, d, a.length, b.length)
    }
  }

  return null
}

/** Обратный проход по следам: правки по порядку, слитые в куски. */
const backtrack = (trace: readonly Int32Array[], last: number, n: number, m: number) => {
  const steps: { x: number; y: number; deleted: boolean }[] = []
  let x = n
  let y = m

  for (let d = last; d > 0; d -= 1) {
    // Срез следа на шаге d хранит диагонали -d-1 … d+1 с началом в 0.
    const saved = trace[d] ?? new Int32Array()
    const at = (k: number) => saved[k + d + 1] ?? 0
    const k = x - y
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1))
    const prevK = down ? k + 1 : k - 1
    const prevX = at(prevK)
    const prevY = prevX - prevK

    // Шаг вниз - вставлена строка b[prevY], вправо - удалена a[prevX]; дальше по диагонали.
    steps.push({ x: prevX, y: prevY, deleted: !down })
    x = prevX
    y = prevY
  }

  const blocks: Block[] = []

  for (const step of steps.reverse()) {
    const tail = blocks.at(-1)
    const block = step.deleted
      ? { oldFrom: step.x, oldTo: step.x + 1, newFrom: step.y, newTo: step.y }
      : { oldFrom: step.x, oldTo: step.x, newFrom: step.y, newTo: step.y + 1 }

    if (tail && tail.oldTo === block.oldFrom && tail.newTo === block.newFrom) {
      tail.oldTo = block.oldTo
      tail.newTo = block.newTo
    } else {
      blocks.push(block)
    }
  }

  return blocks
}

/** Строки - числами: сравнение длинных строк в цикле Майерса дорого. */
const intern = (lines: readonly string[], ids: Map<string, number>) =>
  lines.map((line) => {
    const known = ids.get(line)

    if (known !== undefined) return known

    ids.set(line, ids.size)

    return ids.size - 1
  })

/**
 * Куски различий: общее начало и конец отрезаются, середина равной длины сравнивается
 * строка к строке (это и есть замена по всему файлу), иначе - Майерс в пределах бюджета,
 * а не влезла - одним куском. Любой из вариантов - патч, переводящий текст в другой.
 */
const blocksOf = (old: readonly string[], next: readonly string[]): Block[] => {
  let head = 0

  while (head < old.length && head < next.length && old[head] === next[head]) head += 1

  let tail = 0

  while (
    tail < old.length - head &&
    tail < next.length - head &&
    old[old.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail += 1
  }

  const oldTo = old.length - tail
  const newTo = next.length - tail

  if (head === oldTo && head === newTo) return []

  if (oldTo - head === newTo - head) {
    const blocks: Block[] = []

    for (let at = head; at < oldTo; at += 1) {
      if (old[at] === next[at]) continue

      const tailBlock = blocks.at(-1)

      if (tailBlock?.oldTo === at) {
        tailBlock.oldTo = at + 1
        tailBlock.newTo = at + 1
      } else {
        blocks.push({ oldFrom: at, oldTo: at + 1, newFrom: at, newTo: at + 1 })
      }
    }

    return blocks
  }

  const size = oldTo - head + (newTo - head)
  const budget = Math.min(MAX_DIFF_EDITS, Math.floor(DIFF_WORK_BUDGET / Math.max(size, 1)), size)
  const ids = new Map<string, number>()
  const middle = myersBlocks(
    intern(old.slice(head, oldTo), ids),
    intern(next.slice(head, newTo), ids),
    budget,
  )

  if (!middle) return [{ oldFrom: head, oldTo, newFrom: head, newTo }]

  return middle.map((block) => ({
    oldFrom: block.oldFrom + head,
    oldTo: block.oldTo + head,
    newFrom: block.newFrom + head,
    newTo: block.newTo + head,
  }))
}

/**
 * Последняя строка - в кусок, если поменялся только перевод строки после неё: как общая
 * строка она выпала бы из диффа, и откат оставил бы файл с не тем концом.
 */
const withEnding = (blocks: Block[], old: TextLines, next: TextLines): Block[] => {
  if (old.endsWithBreak === next.endsWithBreak || !old.lines.length || !next.lines.length) {
    return blocks
  }

  const last = blocks.at(-1)

  if (last && last.oldTo === old.lines.length && last.newTo === next.lines.length) return blocks

  return [
    ...blocks,
    {
      oldFrom: old.lines.length - 1,
      oldTo: old.lines.length,
      newFrom: next.lines.length - 1,
      newTo: next.lines.length,
    },
  ]
}

/** Общая строка - или, если только одна сторона кончается на ней без перевода строки, снятая и поставленная. */
const contextLines = (old: TextLines, next: TextLines, at: number, newAt: number): string[] => {
  const text = old.lines[at] ?? ''
  const oldBare = at === old.lines.length - 1 && !old.endsWithBreak
  const newBare = newAt === next.lines.length - 1 && !next.endsWithBreak

  if (oldBare === newBare) return oldBare ? [` ${text}`, NO_BREAK] : [` ${text}`]

  return [`-${text}`, ...(oldBare ? [NO_BREAK] : []), `+${text}`, ...(newBare ? [NO_BREAK] : [])]
}

const sideLines = (side: TextLines, from: number, to: number, mark: string) =>
  side.lines
    .slice(from, to)
    .flatMap((line, index) =>
      from + index === side.lines.length - 1 && !side.endsWithBreak
        ? [mark + line, NO_BREAK]
        : [mark + line],
    )

/**
 * Дифф двух текстов в виде, в каком CLI шлёт свой (`structuredPatch`): ханки по строкам
 * с тремя строками контекста. Откат и сверка читают его так же, как дифф CLI. null -
 * дифф длиннее maxLines строк, такой не носим.
 */
export const lineDiff = (
  before: string,
  after: string,
  maxLines = MAX_DIFF_LINES,
): EditHunk[] | null => {
  const old = splitText(before)
  const next = splitText(after)
  const blocks = withEnding(blocksOf(old.lines, next.lines), old, next)
  const hunks: EditHunk[] = []
  let total = 0
  let index = 0

  while (index < blocks.length) {
    // Куски, чьи контексты сходятся, - в один ханк, как в обычном диффе.
    let last = index

    while ((blocks[last + 1]?.oldFrom ?? Infinity) - (blocks[last]?.oldTo ?? 0) <= 2 * CONTEXT) {
      last += 1
    }

    const group = blocks.slice(index, last + 1)
    const first = group[0]
    const end = group.at(-1)

    if (!first || !end) break

    const oldFrom = Math.max(0, first.oldFrom - CONTEXT)
    const newFrom = first.newFrom - (first.oldFrom - oldFrom)
    const oldTo = Math.min(old.lines.length, end.oldTo + CONTEXT)
    const lines: string[] = []
    // Поштучно, а не push(...): сторона куска бывает в десятки тысяч строк, а столько
    // аргументов вызова V8 не примет.
    const add = (more: readonly string[]) => {
      for (const line of more) lines.push(line)
    }
    let at = oldFrom
    let newAt = newFrom

    for (const block of group) {
      for (; at < block.oldFrom; at += 1, newAt += 1) add(contextLines(old, next, at, newAt))

      add(sideLines(old, block.oldFrom, block.oldTo, '-'))
      add(sideLines(next, block.newFrom, block.newTo, '+'))
      at = block.oldTo
      newAt = block.newTo
    }

    for (; at < oldTo; at += 1, newAt += 1) add(contextLines(old, next, at, newAt))

    total += lines.length

    if (total > maxLines) return null

    hunks.push({ oldStart: oldFrom + 1, newStart: newFrom + 1, lines })
    index = last + 1
  }

  return hunks
}
