import { it, expect, describe } from 'vitest'

import type { DraftToken } from '@shared/claude-draft'

import { chipLabel, chipTitle, collapsesPaste, truncateMiddle } from './chips.utils'
import { clipboardHtml, clipboardTextOf, clipboardTokens } from './draft-clipboard.utils'
import {
  appendChip,
  tokensText,
  composePrompt,
  messageDraftOf,
  imageAttachments,
  trimTrailingSpace,
} from './draft.utils'
import { replayedDraft } from './message-replay.utils'

const PNG = 'data:image/png;base64,AAAA'

const tokens: DraftToken[] = [
  { kind: 'chip', chip: { kind: 'cmd', value: 'review' } },
  { kind: 'text', value: ' look at ' },
  { kind: 'chip', chip: { kind: 'file', value: 'src/a.ts' } },
  { kind: 'text', value: ' and ' },
  { kind: 'chip', chip: { kind: 'img', value: 'Image #9', data: PNG, path: '/tmp/p.png' } },
  { kind: 'text', value: ' ' },
  { kind: 'chip', chip: { kind: 'ref', value: 'b.ts', range: 'L2-L4' } },
  { kind: 'chip', chip: { kind: 'paste', value: 'pasted', text: 'line 1\nline 2' } },
  { kind: 'chip', chip: { kind: 'quote', value: 'ref1', text: 'said' } },
]

describe('черновик для модели', () => {
  it('вложения на своих местах, картинки пронумерованы с начала разговора', () => {
    expect(tokensText(tokens, 2)).toBe(
      '/review look at @src/a.ts and [Image #3] @b.ts (L2-L4)line 1\nline 2"said"',
    )
  })

  it('цитаты строками сверху, пустой хвост не уходит', () => {
    expect(
      composePrompt(
        { tokens: [{ kind: 'text', value: 'why?\n\n' }], quotes: [{ id: 'q', text: 'x = 1' }] },
        0,
      ),
    ).toBe('> x = 1\nwhy?')
    expect(
      trimTrailingSpace([
        { kind: 'text', value: 'a ' },
        { kind: 'text', value: '\n ' },
      ]),
    ).toEqual([{ kind: 'text', value: 'a' }])
  })

  it('байты картинок - вложением, в куски для ленты не едут', () => {
    expect(imageAttachments(tokens)).toEqual([{ mediaType: 'image/png', data: 'AAAA' }])
    expect(JSON.stringify(messageDraftOf({ tokens, quotes: [] }))).not.toContain('AAAA')
  })

  it('кусок файла из редактора - строки и ровно выделенный текст блоком кода', () => {
    const snippet: DraftToken[] = [
      { kind: 'text', value: 'why ' },
      { kind: 'chip', chip: { kind: 'ref', value: 'a.md', range: 'L3', text: 'say "hi" ```x```' } },
      { kind: 'text', value: ' here' },
    ]
    const sent = tokensText(snippet, 0)

    expect(sent).toBe('why @a.md (L3):\n````\nsay "hi" ```x```\n````\n here')
    expect(replayedDraft(sent).tokens).toEqual(snippet)
  })

  it('чип в конец - с пробелами, чтобы не слипся со словом', () => {
    expect(appendChip([{ kind: 'text', value: 'see' }], { kind: 'quote', value: 'ref1' })).toEqual([
      { kind: 'text', value: 'see' },
      { kind: 'text', value: ' ' },
      { kind: 'chip', chip: { kind: 'quote', value: 'ref1' } },
      { kind: 'text', value: ' ' },
    ])
  })
})

describe('чипы', () => {
  it('подпись - имя файла, длинное режется посередине, подсказка - только у обрезанного', () => {
    expect(chipLabel({ kind: 'file', value: 'src/deep/a.ts' })).toBe('a.ts')
    expect(chipTitle({ kind: 'file', value: 'src/deep/a.ts' })).toBe('')
    expect(truncateMiddle('a-very-long-file-name-that-goes-on.tsx')).toHaveLength(28)
    expect(chipTitle({ kind: 'file', value: 'x/a-very-long-file-name-that-goes-on.tsx' })).toBe(
      'x/a-very-long-file-name-that-goes-on.tsx',
    )
  })

  it('вставка сворачивается по строкам, «никогда» - кроме огромной', () => {
    expect(collapsesPaste('a\nb', 2)).toBe(true)
    expect(collapsesPaste('one line', 2)).toBe(false)
    expect(collapsesPaste('one long line', 2, 3)).toBe(true)
    expect(collapsesPaste('a\nb\nc', 0)).toBe(false)
    expect(collapsesPaste('x'.repeat(100_001), 0)).toBe(true)
  })
})

describe('буфер обмена', () => {
  it('в тексте - пути, в html - куски, которые возвращаются живыми', () => {
    expect(clipboardTextOf(tokens)).toBe(
      '/review look at src/a.ts and /tmp/p.png b.ts (L2-L4)line 1\nline 2said',
    )
    expect(clipboardTokens(clipboardHtml(tokens))).toEqual(tokens)
    expect(clipboardTokens('<b>someone else</b>')).toBeNull()
  })
})
