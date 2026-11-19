import { it, expect, describe } from 'vitest'

import { editorNote, splitEditorNote } from './editor-note'

describe('заметка о редакторе словами Codex', () => {
  it('открытый файл и выделение - блоком «Context from my IDE setup»', () => {
    expect(editorNote({ path: '/p/a.ts', name: 'a.ts' })).toBe(
      '# Context from my IDE setup:\n\n## Active file: /p/a.ts\n\nThis may or may not be related to the current task.',
    )
    expect(editorNote({ path: '/p/a.ts', name: 'a.ts', from: 3, to: 4, text: 'x\ny' })).toContain(
      '## Active selection range: lines 3-4\n\n## Active selection of the file:\nx\ny',
    )
    expect(editorNote({ path: '/p/a.ts', name: 'a.ts', from: 7, to: 7 })).toContain(
      '## Active selection range: line 7\n\n(The selection is too long',
    )
  })
})

describe('заметка в одном тексте со словами', () => {
  it('слова отдельно, заметка - ссылкой на редактор; без заметки - текст как есть', () => {
    const note = editorNote({ path: '/p/a.ts', name: 'a.ts', from: 2, to: 3, text: 'x' })

    expect(splitEditorNote(`fix it\n\n${note}`)).toEqual({
      text: 'fix it',
      editor: { path: '/p/a.ts', name: 'a.ts', from: 2, to: 3 },
    })
    expect(splitEditorNote('just words')).toEqual({ text: 'just words', editor: null })
  })
})
