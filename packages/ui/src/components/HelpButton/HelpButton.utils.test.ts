import { it, expect, describe } from 'vitest'

import { helpChunks, helpParagraphs } from './HelpButton.utils'

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

describe('helpChunks', () => {
  it('адрес https - ссылкой, точка за ним - текстом', () => {
    expect(helpChunks('Terms: https://antigravity.google/terms?hl=en. FAQ.')).toEqual([
      { kind: 'text', text: 'Terms: ' },
      { kind: 'url', text: 'https://antigravity.google/terms?hl=en' },
      { kind: 'text', text: '. FAQ.' },
    ])
  })

  it('два адреса по строкам, адрес в конце абзаца', () => {
    expect(helpChunks('A: https://a.example/x\nB: https://b.example/faq.md')).toEqual([
      { kind: 'text', text: 'A: ' },
      { kind: 'url', text: 'https://a.example/x' },
      { kind: 'text', text: '\nB: ' },
      { kind: 'url', text: 'https://b.example/faq.md' },
    ])
  })

  it('без адреса и с http (локальный адрес, не сайт) - один кусок текста', () => {
    expect(helpChunks('Add http://localhost:5319/callback here.')).toEqual([
      { kind: 'text', text: 'Add http://localhost:5319/callback here.' },
    ])
  })
})
