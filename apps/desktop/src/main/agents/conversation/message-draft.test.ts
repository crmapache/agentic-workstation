import { it, expect, describe } from 'vitest'

import { withImageData, parseEditorRef, parseMessageDraft } from './message-draft'

describe('куски сообщения', () => {
  it('кривые куски выбрасываются, байты картинок не сохраняются', () => {
    const draft = parseMessageDraft({
      tokens: [
        { kind: 'text', value: 'see ' },
        {
          kind: 'chip',
          chip: { kind: 'img', value: 'Image #1', data: 'data:image/png;base64,AA' },
        },
        { kind: 'chip', chip: { kind: 'nope', value: 'x' } },
        { kind: 'text', value: 42 },
      ],
      quotes: ['a', 7],
    })

    expect(draft).toEqual({
      tokens: [
        { kind: 'text', value: 'see ' },
        { kind: 'chip', chip: { kind: 'img', value: 'Image #1' } },
      ],
      quotes: ['a'],
    })
    expect(parseMessageDraft({ tokens: [], quotes: [] })).toBeNull()
    expect(parseMessageDraft('text')).toBeNull()
  })

  it('вынутое из очереди получает байты обратно по порядку, без байтов - файлом', () => {
    const draft = {
      tokens: [
        { kind: 'chip' as const, chip: { kind: 'img' as const, value: 'Image #3' } },
        { kind: 'chip' as const, chip: { kind: 'img' as const, value: 'shots/a.png' } },
        {
          kind: 'chip' as const,
          chip: { kind: 'img' as const, value: 'Image #4', path: '/tmp/p.png' },
        },
        { kind: 'chip' as const, chip: { kind: 'img' as const, value: 'Image #5' } },
      ],
      quotes: [],
    }
    const restored = withImageData(draft, [{ mediaType: 'image/png', data: 'AA' }])

    expect(restored.tokens).toEqual([
      { kind: 'chip', chip: { kind: 'img', value: 'Image #3', data: 'data:image/png;base64,AA' } },
      { kind: 'chip', chip: { kind: 'img', value: 'shots/a.png' } },
      { kind: 'chip', chip: { kind: 'img', value: '/tmp/p.png' } },
    ])
  })

  it('открытый файл: путь без перевода строки, строки - только парой', () => {
    expect(parseEditorRef({ path: 'a.ts', name: 'a.ts', from: 2, to: 1 })).toEqual({
      path: 'a.ts',
      name: 'a.ts',
    })
    expect(parseEditorRef({ path: 'a\nb', name: 'b' })).toBeNull()
    expect(parseEditorRef({ path: 'a.ts', name: 'a.ts', from: 1, to: 3, text: 'x' })).toEqual({
      path: 'a.ts',
      name: 'a.ts',
      from: 1,
      to: 3,
      text: 'x',
    })
  })
})
