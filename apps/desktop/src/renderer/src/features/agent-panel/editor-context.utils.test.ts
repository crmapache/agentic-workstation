import { it, expect, describe } from 'vitest'

import { editorGoes, editorLabel, editorChoice } from './editor-context.utils'

describe('открытый файл в сообщении', () => {
  const ref = { path: 'src/a.ts', name: 'a.ts', from: 3, to: 5 }

  it('исключение на одно сообщение - для тех же строк, в обе стороны', () => {
    expect(editorLabel(ref)).toBe('a.ts:3-5')
    expect(editorGoes(true, { key: 'src/a.ts#3-5', on: false }, ref)).toBe(false)
    expect(editorGoes(true, { key: 'src/a.ts#1-2', on: false }, ref)).toBe(true)
    expect(editorChoice(false, { key: 'src/a.ts#3-5', on: true }, ref)).toBe('once')
    expect(editorChoice(false, undefined, ref)).toBe('never')
  })
})
