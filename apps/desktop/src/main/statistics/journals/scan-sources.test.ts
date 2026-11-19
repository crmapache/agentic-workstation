import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import { scanSourcesOf } from './scan-sources'

describe('scanSourcesOf', () => {
  it('reads every provider from the environment of the CLIs', () => {
    expect(
      scanSourcesOf(
        { HOME: '/home/me', CODEX_HOME: '/codex', XDG_DATA_HOME: '/xdg' },
        '/ide',
        '/claude/projects',
      ),
    ).toEqual([
      { provider: 'claude', path: '/claude/projects' },
      { provider: 'codex', path: '/codex' },
      { provider: 'opencode', path: join('/ide', 'opencode', 'data', 'opencode', 'opencode.db') },
      { provider: 'opencode', path: join('/xdg', 'opencode', 'opencode.db') },
      { provider: 'antigravity', path: join('/ide', 'antigravity', 'gemini', 'antigravity-cli') },
      { provider: 'antigravity', path: join('/home/me', '.gemini', 'antigravity-cli') },
      { provider: 'kimi', path: join('/ide', 'kimi', 'home') },
      { provider: 'kimi', path: join('/home/me', '.kimi-code') },
    ])
  })

  it('falls back to the default homes of Codex and OpenCode', () => {
    const sources = scanSourcesOf({ HOME: '/home/me' }, '/ide', '/claude/projects')

    expect(sources.map((source) => source.path)).toEqual([
      '/claude/projects',
      join('/home/me', '.codex'),
      join('/ide', 'opencode', 'data', 'opencode', 'opencode.db'),
      join('/home/me', '.local', 'share', 'opencode', 'opencode.db'),
      join('/ide', 'antigravity', 'gemini', 'antigravity-cli'),
      join('/home/me', '.gemini', 'antigravity-cli'),
      join('/ide', 'kimi', 'home'),
      join('/home/me', '.kimi-code'),
    ])
  })
})
