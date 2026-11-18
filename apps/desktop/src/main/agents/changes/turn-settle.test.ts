import { it, expect, describe } from 'vitest'

import type { FileEdit } from './change-revert'
import { redoEdits, undoEdits } from './change-revert'
import type { TurnFile } from './changes.types'
import { settleFile } from './turn-settle'

const file = (edits: FileEdit[], owing = false): TurnFile => ({
  path: '/p/f',
  edits,
  owing,
  unchanged: false,
})

const patch = (start: number, ...lines: string[]): FileEdit => ({
  kind: 'patch',
  hunks: [{ oldStart: start, newStart: start, lines }],
})

const numbered = (count: number, line: (index: number) => string) =>
  Array.from({ length: count }, (_, index) => `${line(index + 1)}\n`).join('')

describe('сверка файла хода с диском', () => {
  it('файл стоит, как говорят диффы, - сверять нечего', () => {
    const edits = [patch(1, ' one', '-two', '+TWO', ' three')]

    expect(settleFile(file(edits), 'one\ntwo\nthree\n', 'one\nTWO\nthree\n')).toBeNull()
    expect(settleFile(file([{ kind: 'create', content: 'a\n' }]), null, 'a\n')).toBeNull()
  })

  it('созданный файл, переписанный форматтером, - «создан пустым и заполнен», откат его удаляет', () => {
    const written = '.a{color:red}\n'
    const formatted = '.a {\n  color: red;\n}\n'
    const settled = settleFile(file([{ kind: 'create', content: written }]), null, formatted)

    expect(settled).toMatchObject({ added: 3, removed: 0 })
    expect(undoEdits(formatted, settled?.edits ?? [])).toEqual({ kind: 'delete' })
  })

  it('правленный файл, который агент поправил ещё и скриптом, - от копии, откат ставит копию', () => {
    const copy = 'one\ntwo\nthree\nfour\n'
    const left = 'one\nTWO\nthree\nFOUR by sed\n'
    const settled = settleFile(file([patch(1, ' one', '-two', '+TWO', ' three')]), copy, left)

    expect(settled).toMatchObject({ added: 2, removed: 2 })
    expect(undoEdits(left, settled?.edits ?? [])).toEqual({ kind: 'text', text: copy })
  })

  it('копия, к которой первая правка хода не прикладывается, - чужая: не сверяем', () => {
    const edits = [patch(1, ' one', '-two', '+TWO', ' three')]

    expect(settleFile(file(edits), 'older\ncopy\n', 'one\nTWO\nthree\nmore\n')).toBeNull()
    expect(settleFile(file(edits), null, 'one\nTWO\nthree\nmore\n')).toBeNull()
    expect(settleFile(file(edits), 'one\ntwo\nthree\n', null)).toBeNull()
  })

  it('большая правка без диффа - по одной копии, туда и обратно', () => {
    const copy = numbered(500, (index) => `x = foo(${index})`)
    const left = copy.replaceAll('foo(', 'bar(')
    const settled = settleFile(file([], true), copy, left)

    expect(settled).toMatchObject({ added: 500, removed: 500 })
    expect(undoEdits(left, settled?.edits ?? [])).toEqual({ kind: 'text', text: copy })
    expect(redoEdits(copy, settled?.edits ?? [])).toEqual({ kind: 'text', text: left })
  })
})
