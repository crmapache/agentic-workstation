import { it, expect, describe } from 'vitest'

import { redoEdits, undoEdits } from './change-revert'
import { lineDiff } from './line-diff'

/** Ханки обязаны вести текст туда и обратно - это всё, что нужно откату. */
const roundTrip = (before: string, after: string) => {
  const hunks = lineDiff(before, after)

  expect(hunks).not.toBeNull()

  const edits = [{ kind: 'patch' as const, hunks: hunks ?? [] }]

  expect(redoEdits(before, edits)).toEqual({ kind: 'text', text: after })
  expect(undoEdits(after, edits)).toEqual({ kind: 'text', text: before })
}

const numbered = (count: number, line: (index: number) => string) =>
  Array.from({ length: count }, (_, index) => `${line(index + 1)}\n`).join('')

describe('построчный дифф', () => {
  it('замена по всем строкам - туда и обратно', () => {
    const before = numbered(2000, (index) => `item_${index} = foo(${index})`)

    roundTrip(before, before.replaceAll('foo(', 'bar('))
  })

  it('разбросанные правки разной длины - туда и обратно, и только они с контекстом', () => {
    const before = numbered(300, (index) => `line ${index}`)
    const after = before
      .replace('line 7\n', 'seven\n')
      .replace('line 150\n', '')
      .replace('line 299\n', 'line 299\nadded\nadded too\n')

    roundTrip(before, after)
    expect((lineDiff(before, after) ?? []).flatMap((hunk) => hunk.lines).length).toBeLessThan(40)
  })

  it('файлы без перевода строки в конце и пустой файл', () => {
    roundTrip('a\nb\nc', 'a\nB\nc')
    roundTrip('a\nb\nc\n', 'a\nb\nc')
    roundTrip('a\nb\nc', 'a\nb\nc\nd\n')
    roundTrip('', 'x\n')
    roundTrip('x\n', '')
  })

  it('форматтер переписал файл целиком - всё равно туда и обратно', () => {
    const before = numbered(400, (index) => `.a${index}{color:red;margin:0}`)
    const after = before.replace(/\{color:red;margin:0\}/g, ' {\n  color: red;\n  margin: 0;\n}')

    roundTrip(before, after)
  })

  it('одинаковые тексты - пусто, слишком длинный дифф - не делается', () => {
    expect(lineDiff('a\n', 'a\n')).toEqual([])

    const before = numbered(100, String)

    expect(lineDiff(before, before.replaceAll('\n', ' changed\n'), 50)).toBeNull()
  })
})
