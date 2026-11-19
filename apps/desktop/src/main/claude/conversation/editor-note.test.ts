import { it, expect, describe } from 'vitest'

import { MAX_SELECTION_CHARS } from '@shared/message-draft'

import { editorReminder, editorFromReminder } from './editor-note'

describe('заметка о редакторе', () => {
  it('открытый файл - словами CLI и читается обратно', () => {
    const note = editorReminder({ path: 'src/app.ts', name: 'app.ts' })

    expect(note).toBe(
      '<system-reminder>\nThe user opened the file src/app.ts in the IDE. This may or may not be related to the current task.\n</system-reminder>',
    )
    expect(editorFromReminder(note)).toEqual({ path: 'src/app.ts', name: 'app.ts' })
  })

  it('выделенные строки едут с текстом, длинное выделение - только номерами', () => {
    const short = editorReminder({ path: 'a/b.ts', name: 'b.ts', from: 3, to: 5, text: 'x' })
    const long = editorReminder({
      path: 'a/b.ts',
      name: 'b.ts',
      from: 1,
      to: 900,
      text: 'y'.repeat(MAX_SELECTION_CHARS + 1),
    })

    expect(short).toContain('from a/b.ts:\nx\n\n')
    expect(long).toContain('too long to include here')
    expect(long).not.toContain('yyyy')
    expect(editorFromReminder(short)).toEqual({ path: 'a/b.ts', name: 'b.ts', from: 3, to: 5 })
    expect(editorFromReminder(long)).toEqual({ path: 'a/b.ts', name: 'b.ts', from: 1, to: 900 })
  })

  it('те же слова внутри текста человека - не заметка', () => {
    expect(editorFromReminder('I think The user opened the file x in the IDE.')).toBeNull()
  })
})
