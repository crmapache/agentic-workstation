import { rm, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import type { FeedItem, FileChange, ToolFeedItem, TurnFeedItem } from '@shared/conversation-feed'

import type { ConversationFeedSync } from '../conversation/conversation-feed'
import { claudeToolAction } from '../feed/tool-action'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { copyKey } from './file-copies'
import { TurnRevert } from './turn-revert'

const paths = vi.hoisted(() => ({ home: '', transcript: '' }))

vi.mock('../history/transcript-paths', () => ({
  claudeHome: () => Promise.resolve(paths.home),
  findTranscript: () => Promise.resolve(paths.transcript),
}))

const SESSION = 'session-1'
const MESSAGE = '5e1f9a0c-0000-4000-8000-000000000001'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'turn-revert-'))
  paths.home = join(dir, 'home')
  paths.transcript = join(dir, 'conv.jsonl')
  await mkdir(join(paths.home, 'file-history', SESSION), { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true })
})

/** Откат хода над поддельной лентой. */
const revertOf = (runtime: ReturnType<typeof fakeRuntime>) =>
  new TurnRevert(
    runtime as unknown as ConversationRuntime,
    runtime.feed as unknown as ConversationFeedSync,
  )

/** Лента и разговор без процесса: только то, что откату нужно от сборщика. */
const fakeRuntime = (items: FeedItem[], messageId = MESSAGE) => {
  const builder = {
    items,
    latestTurn: { id: 'turn-1', messageId },
    updateChanges: (turnId: string, change: (changes: FileChange[]) => FileChange[]) => {
      const at = items.findIndex((item) => item.id === turnId)
      const turn = items[at]

      if (turn?.kind === 'turn') items[at] = { ...turn, changes: change(turn.changes) }
    },
  }

  return {
    feed: { builder, flush: vi.fn() },
    meta: { projectPath: dir, sessionId: SESSION },
  }
}

/** counts 'uncounted' - большая правка: CLI прислал пустой дифф, цифр у ленты нет. */
const tool = (
  id: string,
  path: string,
  counts: { added: number; removed: number } | 'uncounted',
  input: Record<string, unknown> = { old_string: 'two', new_string: 'TWO' },
) =>
  ({
    kind: 'tool',
    id,
    parentToolUseId: null,
    name: 'Edit',
    input: { file_path: path, ...input },
    action: claudeToolAction('Edit', { file_path: path, ...input }),
    status: 'done',
    result: {
      text: 'ok',
      isError: false,
      truncated: false,
      ...(counts === 'uncounted' ? { uncounted: true } : { changeCounts: counts }),
    },
    startedAt: 0,
    endedAt: 0,
    closedReason: null,
  }) satisfies ToolFeedItem

const turnItem = (changes: FileChange[]): TurnFeedItem => ({
  kind: 'turn',
  id: 'turn-1',
  parentToolUseId: null,
  durationMs: 0,
  costUsd: 0,
  isError: false,
  interrupted: false,
  changes,
  revertable: true,
})

const result = (id: string, path: string, patch: unknown[]) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
  tool_use_result: { filePath: path, structuredPatch: patch },
})

/** Копия файла, которую CLI взял на сообщение человека, - и запись о ней в транскрипте. */
const copied = async (path: string, text: string) => {
  const name = `${copyKey(path)}@v1`

  await writeFile(join(paths.home, 'file-history', SESSION, name), text)
  await writeFile(
    paths.transcript,
    `${[
      JSON.stringify({ type: 'user', uuid: MESSAGE }),
      JSON.stringify({
        type: 'file-history-snapshot',
        messageId: MESSAGE,
        snapshot: {
          timestamp: new Date().toISOString(),
          trackedFileBackups: { 'a.txt': { backupFileName: name } },
        },
      }),
    ].join('\n')}\n`,
  )
}

const LINES = ['a', 'b', 'c', 'two', 'd', 'e', 'f']

const HUNK = {
  oldStart: 1,
  newStart: 1,
  lines: [' a', ' b', ' c', '-two', '+TWO', ' d', ' e', ' f'],
}

describe('откат файлов хода', () => {
  it('ход откатывается и возвращается по своему диффу, чужая строка остаётся', async () => {
    const path = join(dir, 'a.txt')
    const items: FeedItem[] = [tool('t1', path, { added: 1, removed: 1 })]
    const runtime = fakeRuntime(items)
    const revert = revertOf(runtime)

    revert.observe(result('t1', path, [HUNK]))
    await writeFile(path, `${LINES.join('\n').replace('two', 'TWO')}\n`)
    items.push(turnItem([]))
    await revert.captureEnd()

    expect(items.at(-1)).toMatchObject({
      changes: [{ path, added: 1, removed: 1, counted: true, undoable: true }],
    })

    await writeFile(path, `${LINES.join('\n').replace('two', 'TWO')}\nmine\n`)
    await revert.apply('turn-1', null, false)
    await expect(readFile(path, 'utf8')).resolves.toBe(`${LINES.join('\n')}\nmine\n`)
    expect(items.at(-1)).toMatchObject({ changes: [{ reverted: true, refusal: null }] })

    await revert.apply('turn-1', path, true)
    await expect(readFile(path, 'utf8')).resolves.toContain('TWO')
    expect(items.at(-1)).toMatchObject({ changes: [{ reverted: false }] })
  })

  it('форматтер после правки: сверка по копии CLI, откат ставит файл как до хода', async () => {
    const path = join(dir, 'a.txt')
    const before = `${LINES.join('\n')}\n`
    const items: FeedItem[] = [tool('t1', path, { added: 1, removed: 1 })]
    const revert = revertOf(fakeRuntime(items))

    await copied(path, before)
    revert.observe(result('t1', path, [HUNK]))
    await writeFile(path, before.replace('two', 'TWO').replace('f\n', 'F formatted\n'))
    items.push(turnItem([]))
    await revert.captureEnd()

    expect(items.at(-1)).toMatchObject({ changes: [{ added: 2, removed: 2, undoable: true }] })

    await revert.apply('turn-1', path, false)
    await expect(readFile(path, 'utf8')).resolves.toBe(before)
  })

  it('большая правка с пустым диффом: «±» до сверки, потом цифры по копии и откат', async () => {
    const path = join(dir, 'a.txt')
    const before = Array.from({ length: 50 }, (_, index) => `x = foo(${index})\n`).join('')
    const replaceAll = { old_string: 'foo(', new_string: 'bar(', replace_all: true }
    const items: FeedItem[] = [tool('t1', path, 'uncounted', replaceAll)]
    const revert = revertOf(fakeRuntime(items))

    await copied(path, before)
    revert.observe(result('t1', path, []))
    await writeFile(path, before.replaceAll('foo(', 'bar('))
    items.push(turnItem([]))

    const settling = revert.captureEnd()

    expect(items.at(-1)).toMatchObject({ changes: [{ counted: false, undoable: false }] })

    await settling
    expect(items.at(-1)).toMatchObject({
      changes: [{ added: 50, removed: 50, counted: true, undoable: true }],
    })

    await revert.apply('turn-1', path, false)
    await expect(readFile(path, 'utf8')).resolves.toBe(before)
  })

  it('строки хода переписаны руками - отказ, файл не тронут; файла нет - «файла нет»', async () => {
    const path = join(dir, 'a.txt')
    const items: FeedItem[] = [tool('t1', path, { added: 1, removed: 1 })]
    const revert = revertOf(fakeRuntime(items))

    revert.observe(result('t1', path, [HUNK]))
    await writeFile(path, `${LINES.join('\n').replace('two', 'TWO')}\n`)
    items.push(turnItem([]))
    await revert.captureEnd()

    await writeFile(path, `${LINES.join('\n').replace('two', 'Two by hand')}\n`)
    await revert.apply('turn-1', path, false)
    expect(items.at(-1)).toMatchObject({ changes: [{ reverted: false, refusal: 'changed' }] })
    await expect(readFile(path, 'utf8')).resolves.toContain('Two by hand')

    await rm(path)
    await revert.apply('turn-1', path, false)
    expect(items.at(-1)).toMatchObject({ changes: [{ refusal: 'missing' }] })
  })

  it('ход, начатый самим CLI: копия - от его первого вызова, старый снимок не в счёт', async () => {
    const path = join(dir, 'a.txt')
    const before = `${LINES.join('\n')}\n`
    const items: FeedItem[] = [tool('t1', path, { added: 1, removed: 1 })]
    const revert = revertOf(fakeRuntime(items, ''))
    const old = `${copyKey(path)}@v1`
    const fresh = `${copyKey(path)}@v2`

    // Запись до начала хода не в счёт по месту, а не по времени: время у неё нарочно позже.
    await writeFile(join(paths.home, 'file-history', SESSION, old), 'stale\n')
    await writeFile(join(paths.home, 'file-history', SESSION, fresh), before)
    await writeFile(
      paths.transcript,
      `${[
        JSON.stringify({
          type: 'file-history-snapshot',
          snapshot: {
            timestamp: '2099-01-01T00:00:00.000Z',
            trackedFileBackups: { 'a.txt': { backupFileName: old } },
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 't1' }] },
        }),
        JSON.stringify({
          type: 'file-history-delta',
          timestamp: new Date().toISOString(),
          backup: { backupFileName: fresh },
        }),
      ].join('\n')}\n`,
    )
    revert.observe(result('t1', path, [HUNK]))
    await writeFile(path, before.replace('two', 'TWO').replace('f\n', 'F by sed\n'))
    items.push(turnItem([]))
    await revert.captureEnd()

    expect(items.at(-1)).toMatchObject({ changes: [{ added: 2, removed: 2 }] })
    await revert.apply('turn-1', path, false)
    await expect(readFile(path, 'utf8')).resolves.toBe(before)
  })
})
