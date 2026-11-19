import { it, expect, describe } from 'vitest'

import type { DraftToken } from '@shared/message-draft'

import type { CommandEntry } from './slash.types'
import { fileRows, slashState, prepareMentionTargets } from './suggestions.utils'

const commands: CommandEntry[] = [
  { id: 'model', hint: 'switch the model', group: 'built-in' },
  { id: 'compact', hint: '', group: 'project' },
  { id: 'code-review', hint: 'review', argumentHint: '[low|high]', group: 'built-in' },
]
const argumentSets = {
  model: [
    { id: 'opus', hint: 'Opus' },
    { id: 'sonnet', hint: '' },
  ],
}
const state = (head: string | null, tokens: DraftToken[] = [], dismissed = false) =>
  slashState({ head, tokens, commands, argumentSets, dismissed })

describe('подсказка над полем', () => {
  it('команды по «/», набранное целиком - Enter отправит, /model - нет', () => {
    expect(state('/c').rows.map((row) => row.id)).toEqual(['compact', 'code-review'])
    expect(state('/compact').typedInFull).toBe(true)
    expect(state('/model').typedInFull).toBe(false)
    expect(state('/c', [], true).rows).toEqual([])
    expect(state('say /c').rows).toEqual([])
  })

  it('после имени и пробела - значения аргумента, у чипа команды - тоже', () => {
    expect(state('/model so').rows.map((row) => row.id)).toEqual(['sonnet'])

    const chip: DraftToken[] = [
      { kind: 'chip', chip: { kind: 'cmd', value: 'model' } },
      { kind: 'text', value: ' op' },
    ]

    expect(state(null, chip).rows.map((row) => row.id)).toEqual(['opus'])
    expect(state(null, chip).argument).toEqual({ command: 'model', query: 'op' })
  })

  it('серый синтаксис - пока место аргумента пустое', () => {
    expect(state('/code-review ').ghost).toBe('[low|high]')
    expect(state('/code-review h').ghost).toBeNull()
    expect(
      state(null, [
        { kind: 'chip', chip: { kind: 'cmd', value: 'code-review' } },
        { kind: 'text', value: ' ' },
      ]).ghost,
    ).toBe('[low|high]')
  })

  it('файлы и папки по «@» нечётко; пустой запрос - ничего', () => {
    const targets = prepareMentionTargets(['src/file-tree/FileTreeView.tsx', 'README.md'])

    expect(fileRows(targets, 'ftv')[0]).toMatchObject({
      id: 'src/file-tree/FileTreeView.tsx',
      label: 'FileTreeView.tsx',
      kind: 'file',
    })
    expect(fileRows(targets, 'file-tree').map((row) => row.kind)).toContain('folder')
    expect(fileRows(targets, '')).toEqual([])
  })
})
