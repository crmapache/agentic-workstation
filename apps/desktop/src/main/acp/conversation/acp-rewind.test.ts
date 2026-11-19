import { rm, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { ForkOrigin } from '@shared/conversation'

import { AcpFeedBuilder } from '../feed/acp-feed-builder'
import { withForkSeam } from '../feed/acp-fork-seam'
import { previewOf, planCodeRevert, writeCodeRevert } from '../../agents/changes/code-revert'
import { acpChangesFrom } from './acp-rewind'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acp-rewind-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Ход с вызовом правки ACP: дифф в содержимом, вызов применился или нет. */
const edit = (
  builder: AcpFeedBuilder,
  id: string,
  path: string,
  oldText: string | null,
  newText: string,
  status: 'completed' | 'failed' = 'completed',
) => {
  builder.update({
    sessionUpdate: 'tool_call',
    toolCallId: id,
    title: `Edit ${path}`,
    kind: 'edit',
    status: 'pending',
    content: [{ type: 'diff', path, oldText, newText }],
  })
  builder.update({ sessionUpdate: 'tool_call_update', toolCallId: id, status })
}

describe('откат кода агента ACP обратными правками', () => {
  it('правленный файл возвращается, созданный агентом уходит, отказанная правка не в счёт', async () => {
    const math = join(dir, 'math.ts')
    const fresh = join(dir, 'new.ts')
    const builder = new AcpFeedBuilder()

    await writeFile(math, 'a\nb\nc\n')
    await writeFile(fresh, 'fresh\n')

    builder.addUserMessage('m0', 'before', [], false)
    builder.addUserMessage('m1', 'change it', [], false)
    edit(builder, 't1', math, 'a\nc\n', 'a\nb\nc\n')
    edit(builder, 't2', fresh, null, 'fresh\n')
    edit(builder, 't3', math, 'a\nb\nc\n', 'zzz\n', 'failed')

    const plan = await planCodeRevert(acpChangesFrom(builder.items, 'm1'), dir)

    expect(previewOf(plan, dir)).toMatchObject({ state: 'ready', count: 2 })
    expect(plan.ok && (await writeCodeRevert(plan.files))).toBeNull()
    expect(await readFile(math, 'utf8')).toBe('a\nc\n')
    await expect(readFile(fresh, 'utf8')).rejects.toThrow()
  })

  it('файл меняли после правки агента - отказ, ничего не тронуто', async () => {
    const math = join(dir, 'math.ts')
    const builder = new AcpFeedBuilder()

    await writeFile(math, 'something else entirely\n')
    builder.addUserMessage('m1', 'change it', [], false)
    edit(builder, 't1', math, 'a\nc\n', 'a\nb\nc\n')

    const plan = await planCodeRevert(acpChangesFrom(builder.items, 'm1'), dir)

    expect(previewOf(plan, dir)).toEqual({ state: 'changedSince' })
  })
})

describe('шов форка в повторе ACP', () => {
  const origin: ForkOrigin = { sourceSessionId: 's1', sourceTitle: 'Plan', at: '1' }

  it('после сообщений источника, перед первым своим', () => {
    const builder = new AcpFeedBuilder()

    builder.addUserMessage('u1', 'from source', [], false)
    builder.addUserMessage('u2', 'in the fork', [], false)

    const items = withForkSeam(builder.items, origin)

    expect(items.map((item) => item.kind)).toEqual(['user', 'notice', 'user'])
    expect(items[1]).toMatchObject({ code: 'forked', detail: 'Plan', sourceSessionId: 's1' })
  })

  it('без своих сообщений - в конце; не форк - как было', () => {
    const builder = new AcpFeedBuilder()

    builder.addUserMessage('u1', 'from source', [], false)

    expect(withForkSeam(builder.items, origin).at(-1)).toMatchObject({ code: 'forked' })
    expect(withForkSeam(builder.items, null)).toHaveLength(1)
  })
})
