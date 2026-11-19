import { it, expect, describe } from 'vitest'

import { kindOfPath, hasQuotation, replayedDraft } from './message-replay.utils'

const ANSWER =
  'The cache is rebuilt on every start because the key includes the process id, which changes.'

describe('сообщение из транскрипта кусками', () => {
  it('цитаты сверху - отдельно, первая обычная строка кончает блок', () => {
    expect(replayedDraft('> first\n> second\nwhy?\n> not a quote')).toEqual({
      quotes: ['first', 'second'],
      tokens: [{ kind: 'text', value: 'why?\n> not a quote' }],
    })
  })

  it('файл, папка, картинка файлом и кусок файла', () => {
    expect(
      replayedDraft('see @src/a.ts, @docs/ and @shots/x.png at @b.ts (L2-L4).').tokens,
    ).toEqual([
      { kind: 'text', value: 'see ' },
      { kind: 'chip', chip: { kind: 'file', value: 'src/a.ts' } },
      { kind: 'text', value: ', ' },
      { kind: 'chip', chip: { kind: 'dir', value: 'docs/' } },
      { kind: 'text', value: ' and ' },
      { kind: 'chip', chip: { kind: 'img', value: 'shots/x.png' } },
      { kind: 'text', value: ' at ' },
      { kind: 'chip', chip: { kind: 'ref', value: 'b.ts', range: 'L2-L4' } },
      { kind: 'text', value: '.' },
    ])
  })

  it('слово с «@» без папки и расширения - не путь', () => {
    expect(replayedDraft('use @media and mail me@host.com').tokens).toEqual([
      { kind: 'text', value: 'use @media and mail me@host.com' },
    ])
  })

  it('вставленная картинка - чип по подписи', () => {
    expect(replayedDraft('[Image #3] what is this?').tokens).toEqual([
      { kind: 'chip', chip: { kind: 'img', value: 'Image #3' } },
      { kind: 'text', value: ' what is this?' },
    ])
  })

  it('команда - только в самом начале', () => {
    expect(replayedDraft('/review @src/a.ts').tokens).toEqual([
      { kind: 'chip', chip: { kind: 'cmd', value: 'review' } },
      { kind: 'text', value: ' ' },
      { kind: 'chip', chip: { kind: 'file', value: 'src/a.ts' } },
    ])
    expect(replayedDraft('/Users/me/a.ts is broken').tokens).toEqual([
      { kind: 'text', value: '/Users/me/a.ts is broken' },
    ])
    expect(replayedDraft('run /review').tokens).toEqual([{ kind: 'text', value: 'run /review' }])
  })

  it('кавычки - цитата ответа, только если агент это говорил', () => {
    const text = `but "${ANSWER}" - why?`

    expect(replayedDraft(text, [`**Because**: ${ANSWER}`]).tokens).toEqual([
      { kind: 'text', value: 'but ' },
      { kind: 'chip', chip: { kind: 'quote', value: 'ref1', text: ANSWER } },
      { kind: 'text', value: ' - why?' },
    ])
    expect(replayedDraft(text, ['something else']).tokens).toEqual([{ kind: 'text', value: text }])
  })

  it('есть ли кавычки, ради которых стоит смотреть ответы', () => {
    expect(hasQuotation(`"${ANSWER}"`)).toBe(true)
    expect(hasQuotation('a "short" one')).toBe(false)
  })

  it('вид пути', () => {
    expect(kindOfPath('a/b.PNG')).toBe('img')
    expect(kindOfPath('a/b.ts')).toBe('file')
    expect(kindOfPath('a/b/')).toBe('dir')
  })
})
