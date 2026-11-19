import { it, expect, describe } from 'vitest'

import { plainThought, CodexThoughts } from './codex-thoughts'

describe('размышления Codex простым текстом', () => {
  it('заголовок части без звёздочек, незакрытая пара ждёт конца', () => {
    expect(plainThought('**Reading files**\n\nLooking at math.ts')).toBe(
      'Reading files\n\nLooking at math.ts',
    )
    expect(plainThought('**Reading')).toBe('**Reading')
  })

  it('пара звёздочек в разных кусках чистится, новая часть - абзацем', () => {
    const thoughts = new CodexThoughts()

    expect(thoughts.append('r1', '**Read', 0)).toBe('**Read')
    expect(thoughts.append('r1', 'ing**\n\nFirst', 0)).toBe('Reading\n\nFirst')
    expect(thoughts.append('r1', '**Next**', 1)).toBe('Reading\n\nFirst\n\nNext')
    thoughts.forget('r1')
    expect(thoughts.append('r1', 'again', 0)).toBe('again')
  })
})
