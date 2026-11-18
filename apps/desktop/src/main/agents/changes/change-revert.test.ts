import { it, expect, describe } from 'vitest'

import type { FileEdit } from './change-revert'
import { redoEdits, undoEdits, revertText, bringBackText } from './change-revert'

const patch = (newStart: number, ...lines: string[]): FileEdit => ({
  kind: 'patch',
  hunks: [{ oldStart: newStart, newStart, lines }],
})

const text = (value: string) => ({ kind: 'text', text: value })

const CHANGED = { kind: 'changed' }

describe('снять правки хода', () => {
  it('правка снимается, а строки, добавленные выше, остаются', () => {
    const edit = patch(1, ' one', '-two', '+TWO', ' three')

    expect(undoEdits('one\nTWO\nthree\n', [edit])).toEqual(text('one\ntwo\nthree\n'))
    expect(undoEdits('new\nnewer\none\nTWO\nthree\n', [edit])).toEqual(
      text('new\nnewer\none\ntwo\nthree\n'),
    )
  })

  it('строки хода переписаны после него - не угадываем', () => {
    expect(undoEdits('one\nTwo!\nthree\n', [patch(1, ' one', '-two', '+TWO', ' three')])).toEqual(
      CHANGED,
    )
  })

  it('несколько ханков и правок - с последней', () => {
    const edits: FileEdit[] = [
      {
        kind: 'patch',
        hunks: [
          { oldStart: 1, newStart: 1, lines: ['-a', '+A', ' b'] },
          { oldStart: 4, newStart: 4, lines: [' d', '-e', '+E'] },
        ],
      },
      patch(2, ' b', '+inserted', ' c'),
    ]
    const left = 'A\nb\ninserted\nc\nd\nE\n'

    expect(undoEdits(left, edits)).toEqual(text('a\nb\nc\nd\ne\n'))
    expect(redoEdits('a\nb\nc\nd\ne\n', edits)).toEqual(text(left))
  })

  it('созданный удаляется, пока в нём то, что оставил ход, и после правок в том же ходе', () => {
    const created: FileEdit[] = [{ kind: 'create', content: 'FROM node:22\nCOPY . .\n' }]
    const edited: FileEdit[] = [
      { kind: 'create', content: 'package home\n' },
      patch(1, ' package home', '+', '+import x'),
    ]

    expect(undoEdits('FROM node:22\nCOPY . .\n', created)).toEqual({ kind: 'delete' })
    expect(undoEdits('FROM node:22\nCOPY . .\nRUN make\n', created)).toEqual(CHANGED)
    expect(undoEdits('package home\n\nimport x\n', edited)).toEqual({ kind: 'delete' })
  })

  it('конец файла без перевода строки возвращается тоже', () => {
    const written = patch(1, '-one', '-two', '-three', '+z', '\\ No newline at end of file')

    expect(undoEdits('z', [written])).toEqual(text('one\ntwo\nthree\n'))
    expect(redoEdits('one\ntwo\nthree\n', [written])).toEqual(text('z'))
    expect(
      undoEdits('a\nb\nc\n', [patch(1, ' a', '-b', '\\ No newline at end of file', '+b', '+c')]),
    ).toEqual(text('a\nb'))
  })

  it('строки с концом Windows сравниваются как обычные', () => {
    expect(
      undoEdits('one\r\nTWO\r\nthree\r\n', [patch(1, ' one', '-two', '+TWO', ' three')]),
    ).toEqual(text('one\ntwo\nthree\n'))
  })
})

describe('вернуть правки хода', () => {
  it('находит строки там, куда они уехали, и отказывает, где их поменяли', () => {
    const edit = patch(1, ' one', '-two', '+TWO', ' three')

    expect(redoEdits('new\none\ntwo\nthree\n', [edit])).toEqual(text('new\none\nTWO\nthree\n'))
    expect(redoEdits('one\nzwei\nthree\n', [edit])).toEqual(CHANGED)
  })

  it('удалённый созданный пишется заново, чужой файл на его месте не трогается', () => {
    const edits: FileEdit[] = [
      { kind: 'create', content: 'package home\n' },
      patch(1, ' package home', '+', '+import x'),
    ]

    expect(redoEdits(null, edits)).toEqual(text('package home\n\nimport x\n'))
    expect(redoEdits('package home\n\nimport x\n', edits)).toEqual(
      text('package home\n\nimport x\n'),
    )
    expect(redoEdits('something else\n', edits)).toEqual(CHANGED)
  })
})

describe('нажатие: откатить и вернуть', () => {
  it('уже откаченный - «откачен» без записи, созданный на месте - нет', () => {
    const edit = [patch(1, ' one', '-two', '+TWO', ' three')]

    expect(revertText('one\ntwo\nthree\n', edit)).toEqual(text('one\ntwo\nthree\n'))
    expect(revertText('one\nzwei\nthree\n', edit)).toEqual(CHANGED)
    expect(revertText('something\n', [{ kind: 'create', content: 'FROM node:22\n' }])).toEqual(
      CHANGED,
    )
  })

  it('дописанная агентом строка, переписанная руками, - changed, а не «уже откачено»', () => {
    const file = 'a\nb\nc\nd\ne\n'
    const appended = [patch(3, ' c', ' d', ' e', '+Final check line.')]

    expect(revertText(`${file}Final check line, edited by hand.\n`, appended)).toEqual(CHANGED)
    expect(revertText(file, appended)).toEqual(text(file))
    // Настоящий откат к краю не привязан: строка, добавленная под строкой агента, остаётся.
    expect(undoEdits(`${file}Final check line.\nmine\n`, appended)).toEqual(text(`${file}mine\n`))
  })

  it('уже возвращённый - «возвращён» без записи', () => {
    const edit = [patch(1, ' one', '-two', '+TWO', ' three')]

    expect(bringBackText('one\nTWO\nthree\n', edit)).toEqual(text('one\nTWO\nthree\n'))
    expect(bringBackText('one\nzwei\nthree\n', edit)).toEqual(CHANGED)
  })
})
