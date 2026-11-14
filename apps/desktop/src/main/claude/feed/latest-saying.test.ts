import { it, expect, describe } from 'vitest'

import type { FeedItem } from '@shared/claude-feed'

import { lastSentence, latestSaying } from './latest-saying'

describe('lastSentence', () => {
  it('берёт последнюю фразу готового текста', () => {
    expect(lastSentence('I see Notes is open. Let me click New Note.', false)).toBe(
      'Let me click New Note.',
    )
  })

  it('пока текст идёт, недописанную фразу не берёт', () => {
    expect(lastSentence('Notes is open. Let me cli', true)).toBe('Notes is open.')
    expect(lastSentence('Let me cli', true)).toBeNull()
    expect(lastSentence('Notes is open. Now the title.', true)).toBe('Now the title.')
    expect(lastSentence('Steps\n', true)).toBe('Steps')
  })

  it('без разметки и с точкой внутри числа', () => {
    expect(lastSentence('**Done.** Version 2.1 is `installed`', false)).toBe(
      'Version 2.1 is installed',
    )
    expect(lastSentence('Plan:\n- open the app\n- click **Save**', false)).toBe('click Save')
  })

  it('длинную режет с многоточием', () => {
    const saying = lastSentence(`${'word '.repeat(60)}end.`, false) ?? ''

    expect(saying.length).toBeLessThanOrEqual(140)
    expect(saying.endsWith('…')).toBe(true)
  })
})

describe('latestSaying', () => {
  const item = (kind: 'assistant' | 'thinking', text: string, streaming = false) =>
    ({ id: kind, kind, text, streaming, tokens: 0 }) as unknown as FeedItem

  it('последний ответ или размышление в заплатке', () => {
    expect(
      latestSaying({
        conversationId: 'c',
        upserts: [item('thinking', 'Hmm.'), item('assistant', 'Opening Safari.')],
      }),
    ).toBe('Opening Safari.')
  })

  it('скрытое размышление и заплатка без текста - нечего', () => {
    expect(latestSaying({ conversationId: 'c', upserts: [item('thinking', '', true)] })).toBeNull()
    expect(latestSaying({ conversationId: 'c', upserts: [] })).toBeNull()
  })
})
