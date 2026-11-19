import { rm, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { AskOnce } from '../run-stream/ask-once'
import { askAcpOnce } from './acp-ask'
import {
  callsOf,
  replyTo,
  fakeCalls,
  fakeRunHost,
  installFakeAgent,
} from './__fixtures__/fake-acp-agent'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acp-ask-'))
  await installFakeAgent(dir)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const question = (prompt: string, extra: Partial<AskOnce> = {}): AskOnce => ({
  prompt,
  model: '',
  effort: 'low',
  cwd: join(dir, 'ask'),
  timeoutMs: 10_000,
  ...extra,
})

describe('разовый вопрос агенту ACP', () => {
  it('сессия в плане, схема словами, JSON из ответа, сессия удалена', async () => {
    const answer = await askAcpOnce(
      fakeRunHost(dir),
      question('json please', {
        system: 'You name things.',
        schema: { type: 'object', properties: { message: { type: 'string' } } },
      }),
    )

    expect(answer).toEqual({
      text: '{"message":"Hi","ok":true}',
      output: { message: 'Hi', ok: true },
    })

    const calls = await fakeCalls(dir)
    const sent = callsOf(calls, 'session/prompt')[0]?.params?.['prompt'] as { text: string }[]

    expect(callsOf(calls, 'session/new')[0]?.params).toEqual({
      cwd: join(dir, 'ask'),
      mcpServers: [],
    })
    // Уровня low у этой модели нет (только off и on) - размышление не трогается, режим - план.
    expect(
      callsOf(calls, 'session/set_config_option').map((call) => call.params?.['value']),
    ).toEqual(['plan'])
    expect(sent[0]?.text).toMatch(/^You name things\.\n\njson please\n\nReply with a single JSON/)
    expect(callsOf(calls, 'session/delete')).toHaveLength(1)
    // Ход кончился сам: обрывать нечего.
    expect(callsOf(calls, 'session/cancel')).toEqual([])
  })

  it('спросить некого: команда - отказ без вопроса, ответ - последнее сообщение', async () => {
    const answer = await askAcpOnce(fakeRunHost(dir), question('run a command'))

    expect(answer).toEqual({ text: 'Refused.', output: null })
    expect(replyTo(await fakeCalls(dir), 101)?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'reject' },
    })
  })

  it('время вышло - ход оборван, сессия удалена', async () => {
    const answer = await askAcpOnce(
      fakeRunHost(dir),
      question('a long command', { timeoutMs: 300 }),
    )

    expect(answer).toEqual({ error: 'The model took too long to answer.' })

    const calls = await fakeCalls(dir)

    expect(callsOf(calls, 'session/cancel')).toHaveLength(1)
    expect(callsOf(calls, 'session/delete')).toHaveLength(1)
  })

  it('без входа - понятный отказ, панель узнаёт', async () => {
    const seen = { signedOut: 0, released: 0 }

    await writeFile(join(dir, 'signed-out'), '')

    const answer = await askAcpOnce(fakeRunHost(dir, seen), question('look'))

    expect(answer).toEqual({
      error: 'Kimi Code is not signed in. Sign in on the Kimi Code panel and run again.',
    })
    expect(seen.signedOut).toBe(1)
  })
})
