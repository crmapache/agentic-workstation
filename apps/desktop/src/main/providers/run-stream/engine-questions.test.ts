import { it, expect, describe } from 'vitest'

import { unwrapShell } from './engine-questions'

describe('команда без обёртки оболочки', () => {
  it('снимает zsh, bash и sh с -lc и -c, с кавычками и без', () => {
    expect(unwrapShell("/bin/zsh -lc 'pnpm test'")).toBe('pnpm test')
    expect(unwrapShell('bash -c "git status"')).toBe('git status')
    expect(unwrapShell('sh -c ls')).toBe('ls')
  })

  it('обычную команду не трогает', () => {
    expect(unwrapShell('pnpm test')).toBe('pnpm test')
    expect(unwrapShell('zshrc-check -lc x')).toBe('zshrc-check -lc x')
  })
})
