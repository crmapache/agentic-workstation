import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { it, expect, describe } from 'vitest'

import {
  parseTokens,
  tokensBlock,
  tokenClosure,
  referencedTokens,
  parseReducedMotion,
} from './design-tokens'
import { TOKENS_PATH } from './paths'

const SAMPLE = `
/* --not-a-token: red; */
@property --font-scale { syntax: '<number>'; inherits: true; initial-value: 1; }
:root {
  color-scheme: dark;
  --palette-orange-400: #f26a2e;
  --color-accent: var(--palette-orange-400);
  --gradient: linear-gradient(
    var(--palette-orange-400),
    transparent
  );
  --duration-slow: 260ms;
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-slow: 0ms;
  }
}
[data-calm] {
  --color-accent: gray;
}
`

describe('токены дизайн-системы в расширении', () => {
  it('читает объявления :root, многострочные - одной строкой', () => {
    const tokens = parseTokens(SAMPLE)

    expect(tokens.get('--color-accent')).toBe('var(--palette-orange-400)')
    expect(tokens.get('--gradient')).toBe(
      'linear-gradient( var(--palette-orange-400), transparent )',
    )
    expect(tokens.has('--not-a-token')).toBe(false)
  })

  it('значения вложенных блоков (@media, атрибуты) не перекрывают основные', () => {
    expect(parseTokens(SAMPLE).get('--duration-slow')).toBe('260ms')
    expect(parseTokens(SAMPLE).get('--color-accent')).toBe('var(--palette-orange-400)')
    expect(parseReducedMotion(SAMPLE)).toEqual(new Map([['--duration-slow', '0ms']]))
  })

  it('уменьшенное движение - своим блоком и только для нужных токенов', () => {
    const block = tokensBlock(
      '.a { transition-duration: var(--duration-slow); }',
      parseTokens(SAMPLE),
      parseReducedMotion(SAMPLE),
    )

    expect(block).toContain('--duration-slow: 260ms;')
    expect(block).toContain('@media (prefers-reduced-motion: reduce) {')
    expect(block).toContain('    --duration-slow: 0ms;')
    expect(
      tokensBlock(
        '.a { color: var(--color-accent); }',
        parseTokens(SAMPLE),
        parseReducedMotion(SAMPLE),
      ),
    ).not.toContain('@media')
  })

  it('берёт нужные токены и то, на что они ссылаются', () => {
    const tokens = parseTokens(SAMPLE)

    expect([...tokenClosure(['--color-accent'], tokens).keys()]).toEqual([
      '--color-accent',
      '--palette-orange-400',
    ])
    expect(() => tokenClosure(['--missing'], tokens)).toThrow('--missing')
  })

  it('блок для :root и :host только с нужным', () => {
    const block = tokensBlock('.a { color: var(--color-accent); }', parseTokens(SAMPLE))

    expect(block).toContain(':root,\n:host {')
    expect(block).toContain('--palette-orange-400: #f26a2e;')
    expect(block).not.toContain('--gradient')
    expect(tokensBlock('.a { color: inherit; }', parseTokens(SAMPLE))).toBe('')
  })

  it('настоящий файл токенов разбирается, все ссылки в нём известны', () => {
    const tokens = parseTokens(readFileSync(TOKENS_PATH, 'utf8'))

    expect(tokens.get('--color-accent')).toBe('var(--palette-orange-400)')
    expect(() => tokenClosure([...tokens.keys()], tokens)).not.toThrow()
  })

  it('стили расширения ссылаются только на существующие токены', () => {
    const tokens = parseTokens(readFileSync(TOKENS_PATH, 'utf8'))

    for (const file of ['overlay/overlay.css', 'popup/popup.css']) {
      const css = readFileSync(resolve(import.meta.dirname, '../src', file), 'utf8')

      expect(() => tokenClosure(referencedTokens(css), tokens)).not.toThrow()
    }
  })
})
