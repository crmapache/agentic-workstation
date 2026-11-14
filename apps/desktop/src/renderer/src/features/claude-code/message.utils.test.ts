import { it, expect, describe } from 'vitest'

import type { MessageDraft } from '@shared/claude-draft'
import type { UserFeedItem } from '@shared/claude-feed'

import {
  pasteBody,
  lostImages,
  rangePlace,
  messageLine,
  messageDraft,
  answersBefore,
  pastedOrdinals,
  reusableMessage,
  messageClipboard,
} from './message.utils'

const draft: MessageDraft = {
  quotes: ['the cache line'],
  tokens: [
    { kind: 'chip', chip: { kind: 'cmd', value: 'review' } },
    { kind: 'text', value: ' look at ' },
    { kind: 'chip', chip: { kind: 'file', value: 'src/app/a.ts' } },
    { kind: 'text', value: ' and ' },
    { kind: 'chip', chip: { kind: 'img', value: 'Image #2', path: '/tmp/p.png' } },
    { kind: 'text', value: ' ' },
    { kind: 'chip', chip: { kind: 'img', value: 'Image #3' } },
    { kind: 'text', value: ' ' },
    { kind: 'chip', chip: { kind: 'ref', value: 'b.ts', range: 'L2-L4' } },
  ],
}

const item = (patch: Partial<UserFeedItem>): UserFeedItem => ({
  id: 'u1',
  kind: 'user',
  parentToolUseId: null,
  text: '',
  time: 0,
  images: [],
  steering: false,
  ...patch,
})

const pictures = (count: number) => Array.from({ length: count }, () => ({ thumbnail: '' }))

describe('отправленное сообщение', () => {
  it('куски поля важнее текста; без них - разбор текста', () => {
    expect(messageDraft(item({ text: '@a.ts', draft }))).toBe(draft)
    expect(messageDraft(item({ text: '@a.ts' })).tokens).toEqual([
      { kind: 'chip', chip: { kind: 'file', value: 'a.ts' } },
    ])
  })

  it('копия - цитаты сверху и пути, а не подписи', () => {
    expect(messageClipboard(draft)).toBe(
      '> the cache line\n/review look at src/app/a.ts and Image #2 Image #3 b.ts (L2-L4)',
    )
  })

  it('строка-напоминание - подписи чипов', () => {
    expect(messageLine(draft)).toBe(
      '> the cache line\n/review look at a.ts and Image #2 Image #3 b.ts L2-L4',
    )
  })

  it('в поле: картинка с файлом - файлом, без файла и байтов - выпадает и считается', () => {
    const reused = reusableMessage(draft)

    expect(reused.lostImages).toBe(1)
    expect(reused.draft.quotes).toEqual(['the cache line'])
    expect(reused.draft.tokens).toContainEqual({
      kind: 'chip',
      chip: { kind: 'img', value: '/tmp/p.png' },
    })
    expect(reused.draft.tokens).not.toContainEqual({
      kind: 'chip',
      chip: { kind: 'img', value: 'Image #3' },
    })
    // Текст по краям выпавшей картинки сливается в один кусок.
    expect(reused.draft.tokens.at(-2)).toEqual({ kind: 'text', value: '  ' })
  })

  it('в поле: картинка из сообщения возвращается байтами; до нажатия считаются только пропащие', () => {
    const reused = reusableMessage(draft, ['data:image/png;base64,AA', 'data:image/png;base64,BB'])

    expect(reused.lostImages).toBe(0)
    expect(reused.draft.tokens).toContainEqual({
      kind: 'chip',
      chip: { kind: 'img', value: 'Image #3', data: 'data:image/png;base64,BB' },
    })
    expect(lostImages(draft, 2)).toBe(0)
    expect(lostImages(draft, 1)).toBe(1)
  })

  it('картинки без чипа (прежнее поле) - чипами в конце, а не теряются', () => {
    const looked = messageDraft(item({ text: 'look [Image #1]', images: pictures(3) }))

    expect(looked.tokens).toEqual([
      { kind: 'text', value: 'look ' },
      { kind: 'chip', chip: { kind: 'img', value: 'Image #1' } },
      { kind: 'text', value: ' ' },
      { kind: 'chip', chip: { kind: 'img', value: 'Image #2' } },
      { kind: 'text', value: ' ' },
      { kind: 'chip', chip: { kind: 'img', value: 'Image #3' } },
    ])
    expect(messageDraft(item({ images: pictures(1) })).tokens).toEqual([
      { kind: 'chip', chip: { kind: 'img', value: 'Image #1' } },
    ])
    expect(reusableMessage(looked, [null, 'data:image/png;base64,BB', null]).lostImages).toBe(2)
  })

  it('ответы выше сообщения', () => {
    const items = [
      { id: 'a0', kind: 'assistant', parentToolUseId: null, text: 'first', streaming: false },
      item({ id: 'u1' }),
      { id: 'a1', kind: 'assistant', parentToolUseId: null, text: 'later', streaming: false },
    ] as const

    expect(answersBefore(items, 'u1')).toEqual(['first'])
  })

  it('номера вставленных картинок по чипам', () => {
    expect(pastedOrdinals(draft.tokens)).toEqual([-1, -1, -1, -1, 0, -1, 1, -1, -1])
  })

  it('раскрытая вставка режется по строке и говорит, сколько показано', () => {
    const long = Array.from({ length: 5000 }, (_, index) => `line ${index} ${'x'.repeat(20)}`).join(
      '\n',
    )
    const body = pasteBody(long)

    expect(body.lines).toBe(5000)
    expect(body.shownLines).toBeLessThan(5000)
    expect(body.text.endsWith('\n')).toBe(false)
    expect(pasteBody('a\nb\n')).toEqual({ text: 'a\nb', shownLines: 2, lines: 2 })
  })

  it('место куска файла по подписи', () => {
    expect(rangePlace('L12')).toEqual({ line: 12 })
    expect(rangePlace('L12-L18')).toEqual({ line: 12, endLine: 18 })
    expect(rangePlace('L12:5-30')).toEqual({ line: 12, column: 5, endColumn: 29 })
    expect(rangePlace('L12:5-L18:30')).toEqual({
      line: 12,
      column: 5,
      endLine: 18,
      endColumn: 29,
    })
    expect(rangePlace('lines 3 to 4')).toEqual({})
  })
})
