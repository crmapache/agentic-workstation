import { rm, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { FeedItem } from '@shared/conversation-feed'

import { toolItemsOf } from '../feed/codex-tools'
import { previewOf, changesFrom, planCodeRevert, writeCodeRevert } from './codex-code-rewind'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codex-code-rewind-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const user = (id: string): FeedItem => ({
  kind: 'user',
  id,
  parentToolUseId: null,
  text: id,
  time: 0,
  images: [],
  steering: false,
})

/** Правка файла - тем же разбором, что живая лента (`fileChange` из app-server). */
const patch = (id: string, path: string, kind: string, diff: string): FeedItem[] =>
  toolItemsOf(
    {
      type: 'fileChange',
      id,
      status: 'completed',
      changes: [{ path, kind: { type: kind }, diff }],
    },
    { parent: null, startedAt: 0, endedAt: 0 },
  )

describe('откат кода Codex обратными правками', () => {
  it('правленный файл возвращается, созданный агентом - уходит', async () => {
    await writeFile(join(dir, 'math.ts'), 'a\nb\nc\n')
    await writeFile(join(dir, 'new.ts'), 'fresh\n')

    const items = [
      user('m1'),
      ...patch('p1', join(dir, 'math.ts'), 'update', '@@ -1,2 +1,3 @@\n a\n+b\n c'),
      ...patch('p2', join(dir, 'new.ts'), 'add', 'fresh\n'),
    ]
    const plan = await planCodeRevert(changesFrom(items, 'm1'), dir)

    expect(previewOf(plan, dir)).toMatchObject({
      state: 'ready',
      count: 2,
      insertions: 0,
      deletions: 2,
    })
    if (!plan.ok) throw new Error('not ok')
    expect(await writeCodeRevert(plan.files)).toBeNull()
    expect(await readFile(join(dir, 'math.ts'), 'utf8')).toBe('a\nc\n')
    await expect(readFile(join(dir, 'new.ts'), 'utf8')).rejects.toThrow()
  })

  it('файл после правки переписали - откат кода не трогает ничего', async () => {
    await writeFile(join(dir, 'math.ts'), 'something else\n')

    const items = [
      user('m1'),
      ...patch('p1', join(dir, 'math.ts'), 'update', '@@ -1,2 +1,3 @@\n a\n+b\n c'),
    ]
    const plan = await planCodeRevert(changesFrom(items, 'm1'), dir)

    expect(plan.ok).toBe(false)
    expect(previewOf(plan, dir)).toEqual({ state: 'changedSince' })
  })

  it('удалённый агентом файл возвращается с текстом, перенесённый - на старое место', async () => {
    await writeFile(join(dir, 'moved.ts'), 'b\n')

    const items = [
      user('m1'),
      ...patch('p1', join(dir, 'util.ts'), 'delete', 'export const a = 1\n'),
      ...toolItemsOf(
        {
          type: 'fileChange',
          id: 'p2',
          status: 'completed',
          changes: [
            {
              path: join(dir, 'old.ts'),
              kind: { type: 'update', move_path: join(dir, 'moved.ts') },
              diff: '@@ -1 +1 @@\n-a\n+b',
            },
          ],
        },
        { parent: null, startedAt: 0, endedAt: 0 },
      ),
    ]
    const plan = await planCodeRevert(changesFrom(items, 'm1'), dir)

    if (!plan.ok) throw new Error(plan.reason)
    expect(await writeCodeRevert(plan.files)).toBeNull()
    expect(await readFile(join(dir, 'util.ts'), 'utf8')).toBe('export const a = 1\n')
    expect(await readFile(join(dir, 'old.ts'), 'utf8')).toBe('a\n')
    await expect(readFile(join(dir, 'moved.ts'), 'utf8')).rejects.toThrow()
  })

  it('правка вне проекта - откат кода не пишет туда и не трогает ничего', async () => {
    const items = [user('m1'), ...patch('p1', '/etc/hosts-copy', 'add', 'x\n')]

    expect(previewOf(await planCodeRevert(changesFrom(items, 'm1'), dir), dir)).toEqual({
      state: 'outsideProject',
    })
  })

  it('файл поменяли между сухим прогоном и записью - не пишется ничего', async () => {
    await writeFile(join(dir, 'math.ts'), 'a\nb\nc\n')

    const items = [
      user('m1'),
      ...patch('p1', join(dir, 'math.ts'), 'update', '@@ -1,2 +1,3 @@\n a\n+b\n c'),
    ]
    const plan = await planCodeRevert(changesFrom(items, 'm1'), dir)

    if (!plan.ok) throw new Error(plan.reason)
    await writeFile(join(dir, 'math.ts'), 'a\nb\nc\nmine\n')
    expect(await writeCodeRevert(plan.files)).toBe('changedSince')
    expect(await readFile(join(dir, 'math.ts'), 'utf8')).toBe('a\nb\nc\nmine\n')
  })
})
