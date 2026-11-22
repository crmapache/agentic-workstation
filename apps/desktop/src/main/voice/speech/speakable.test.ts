import { it, expect, describe } from 'vitest'

import { SentenceFeed } from './sentence-feed'
import { settledEnd, speakableSentences } from './speakable'

describe('speakableSentences', () => {
  it('drops code blocks, tables, links and markup', () => {
    const text = [
      '## Done',
      'I fixed **the bug** in `pnpm` setup. See [the docs](https://example.com) or https://x.dev.',
      '```ts',
      'const a = 1',
      '```',
      '| a | b |',
      '| - | - |',
      '- first item',
      '- second item.',
      'The path `apps/desktop/src/main/voice/speech/speakable.ts` is new.',
    ].join('\n')

    expect(speakableSentences(text)).toEqual([
      'Done',
      'I fixed the bug in pnpm setup.',
      'See the docs or.',
      'first item',
      'second item.',
      'The path is new.',
    ])
  })

  it('does not split a number with a dot inside', () => {
    expect(speakableSentences('Version 2.1 is out. Next one!')).toEqual([
      'Version 2.1 is out.',
      'Next one!',
    ])
  })

  it('keeps the end of a sentence that closes with a link', () => {
    expect(speakableSentences('Read https://x.dev/a. Then go on')).toEqual(['Read.', 'Then go on'])
  })
})

describe('settledEnd', () => {
  it('stops after the last finished sentence', () => {
    const text = 'One. Two is still'

    expect(text.slice(0, settledEnd(text))).toBe('One.')
  })

  it('waits for an open code block to close', () => {
    const text = 'Here:\n```\ncode. more.\n'

    expect(text.slice(0, settledEnd(text))).toBe('Here:\n')
  })
})

describe('SentenceFeed', () => {
  it('gives each finished sentence once while the answer grows', () => {
    const feed = new SentenceFeed()

    expect(feed.take('Hello', true)).toEqual([])
    expect(feed.take('Hello there. How', true)).toEqual(['Hello there.'])
    expect(feed.take('Hello there. How are you? I', true)).toEqual(['How are you?'])
    expect(feed.take('Hello there. How are you? I am fine', false)).toEqual(['I am fine'])
    expect(feed.take('Hello there. How are you? I am fine', false)).toEqual([])
  })

  it('speaks after a code block once it closes', () => {
    const feed = new SentenceFeed()

    expect(feed.take('Run this:\n```\nls -la. x\n', true)).toEqual(['Run this:'])
    expect(feed.take('Run this:\n```\nls -la. x\n```\nThen check. ', true)).toEqual(['Then check.'])
  })

  it('starts over when the text is rewritten', () => {
    const feed = new SentenceFeed()

    feed.take('First. Second. ', true)
    expect(feed.take('Other. ', true)).toEqual(['Other.'])
  })
})
