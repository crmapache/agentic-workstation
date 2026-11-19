import { rm, mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { ExtensionAuthoring } from './authoring'

describe('расширение с ИИ - кому можно начать разговор (ADR 0094)', () => {
  let root = ''
  let talks: string[] = []

  const authoring = () =>
    new ExtensionAuthoring({
      root,
      converse: (provider) => {
        talks.push(provider)

        return Promise.resolve()
      },
      exists: (id) => id === 'todo',
      rescan: () => Promise.resolve(),
    })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'authoring-'))
    talks = []
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('провайдер только для чата - отказ до заготовки и до разговора', async () => {
    expect(await authoring().create('Todo', 'list my tasks', 'antigravity')).toBe('chat-only')
    expect(await authoring().edit('todo', 'Todo', 'add a filter', 'antigravity')).toBe('chat-only')
    expect(await readdir(root)).toEqual([])
    expect(talks).toEqual([])
  })

  it('незнакомый провайдер - no-provider, обычный - разговор с ним', async () => {
    expect(await authoring().create('Todo', 'list my tasks', 'gemini')).toBe('no-provider')
    expect(await authoring().create('Timer', 'a pomodoro timer', 'kimi')).toBeNull()
    expect(talks).toEqual(['kimi'])
  })
})
