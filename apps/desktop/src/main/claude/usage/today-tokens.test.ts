import { mkdir, utimes, mkdtemp, writeFile, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import { TodayTokens } from './today-tokens'
import { lineTokens } from './transcript-answers'

const NOW = Date.parse('2026-10-19T15:00:00')

const answer = (id: string, request: string, at: string, output: number) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: at,
    requestId: request,
    message: {
      id,
      usage: { input_tokens: 10, output_tokens: output, cache_read_input_tokens: 100 },
    },
  })

const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), 'today-tokens-'))
  const projects = join(root, 'projects')
  const clock = { now: NOW }

  await mkdir(join(projects, '-p-a'), { recursive: true })

  return {
    clock,
    projects,
    tokens: new TodayTokens(
      () => Promise.resolve(projects),
      () => clock.now,
    ),
  }
}

describe('токены за сегодня из транскриптов', () => {
  it('расход ответа - вход, выход и кэш; не ответ модели - ничего', () => {
    expect(lineTokens(answer('m1', 'r1', '2026-10-19T10:00:00', 5))?.tokens).toBe(115)
    expect(lineTokens('{"type":"user","message":{"content":"usage"}}')).toBeNull()
    expect(lineTokens('not json "usage" "assistant"')).toBeNull()
  })

  it('ответ из нескольких строк и копий - раз, по наибольшему; вчерашний не считается', async () => {
    const { projects, tokens } = await setup()
    const file = join(projects, '-p-a', 's.jsonl')

    await writeFile(
      file,
      [
        answer('m1', 'r1', '2026-10-19T10:59:59', 5),
        answer('m1', 'r1', '2026-10-19T11:02:00', 50),
        answer('m0', 'r0', '2026-10-18T23:59:00', 999),
        '',
      ].join('\n'),
    )
    // Копия ответа в форке: тот же ответ - не второй.
    await writeFile(
      join(projects, '-p-a', 'fork.jsonl'),
      `${answer('m1', 'r1', '2026-10-19T11:00:00', 50)}\n`,
    )

    expect(await tokens.count()).toBe(160)

    // Дописанное дочитывается с места остановки, недописанная строка ждёт.
    await appendFile(file, `${answer('m2', 'r2', '2026-10-19T11:30:00', 1)}\n{"usage"`)
    expect(await tokens.count()).toBe(160 + 111)
  })

  it('субагенты разговора считаются: их транскрипты лежат глубже, в subagents/', async () => {
    const { projects, tokens } = await setup()
    const nested = join(projects, '-p-a', 'session-1', 'subagents', 'workflows', 'w1')

    await writeFile(
      join(projects, '-p-a', 'session-1.jsonl'),
      `${answer('m1', 'r1', '2026-10-19T10:00:00', 5)}\n`,
    )
    await mkdir(nested, { recursive: true })
    await writeFile(
      join(projects, '-p-a', 'session-1', 'subagents', 'agent-a.jsonl'),
      `${answer('s1', 'rs1', '2026-10-19T10:01:00', 20)}\n`,
    )
    await writeFile(
      join(nested, 'agent-b.jsonl'),
      `${answer('s2', 'rs2', '2026-10-19T10:02:00', 40)}\n`,
    )

    expect(await tokens.count()).toBe(115 + 130 + 150)
  })

  it('файл, не тронутый сегодня, не читается; в полночь счёт начинается заново', async () => {
    const { clock, projects, tokens } = await setup()
    const old = join(projects, '-p-a', 'old.jsonl')
    const file = join(projects, '-p-a', 's.jsonl')
    const month = new Date('2026-09-01T12:00:00')

    await writeFile(old, `${answer('m9', 'r9', '2026-10-19T09:00:00', 890)}\n`)
    await utimes(old, month, month)
    await writeFile(file, `${answer('m1', 'r1', '2026-10-19T10:00:00', 5)}\n`)

    expect(await tokens.count()).toBe(115)

    clock.now = Date.parse('2026-10-20T09:00:00')
    await appendFile(file, `${answer('m2', 'r2', '2026-10-20T08:00:00', 1)}\n`)

    expect(await tokens.count()).toBe(111)
  })
})
