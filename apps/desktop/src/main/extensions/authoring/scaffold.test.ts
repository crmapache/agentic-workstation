import { rm, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { parseManifest } from '../manifest/manifest'
import { extensionIdFor, scaffoldExtension } from './scaffold'

describe('extensionIdFor', () => {
  it('делает id из имени и обходит занятые', () => {
    expect(extensionIdFor('Git Guard!', () => false)).toBe('git-guard')
    expect(extensionIdFor('42 Pomodoro timer', () => false)).toBe('pomodoro-timer')
    expect(extensionIdFor('Счётчик', () => false)).toBe('extension')
    expect(extensionIdFor('Todo', (id) => id === 'todo' || id === 'todo-2')).toBe('todo-3')
  })
})

describe('scaffoldExtension', () => {
  let root = ''

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'scaffold-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('кладёт рабочую заготовку с руководством для ИИ', async () => {
    const dir = await scaffoldExtension(root, 'todo', { name: 'Todo', description: 'A todo list.' })
    const manifest = parseManifest(await readFile(join(dir, 'extension.json'), 'utf8'), 'todo')

    expect(manifest).toMatchObject({
      ok: true,
      manifest: { id: 'todo', name: 'Todo', version: '0.1.0' },
    })
    expect(await readFile(join(dir, 'main.js'), 'utf8')).toContain('export async function activate')
    expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toContain('ide.d.ts')
    expect(await readFile(join(dir, 'CLAUDE.md'), 'utf8')).toContain('@AGENTS.md')
    expect(await readFile(join(dir, 'ide.d.ts'), 'utf8')).toContain('declare const ide: Ide')
  })
})
