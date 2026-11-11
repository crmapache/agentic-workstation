import { it, expect, describe } from 'vitest'

import { helpParagraphs } from './HelpButton.utils'

describe('helpParagraphs', () => {
  it('делит по пустой строке, перенос внутри абзаца оставляет', () => {
    expect(helpParagraphs('Первый\nтот же.\n\nВторой.\n  \nТретий.')).toEqual([
      'Первый\nтот же.',
      'Второй.',
      'Третий.',
    ])
  })

  it('пустой текст - ни одного абзаца', () => {
    expect(helpParagraphs('  \n\n ')).toEqual([])
  })
})
