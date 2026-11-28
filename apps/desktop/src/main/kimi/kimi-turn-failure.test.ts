import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach } from 'vitest'

import { firstTurnEnd, sessionDirOf, kimiTurnFailure } from './kimi-turn-failure'

const SESSION = 'session_903062d2-0aaf-4d84-b18a-98bfcc38b4aa'

/** Отказ подписки - строка журнала Kimi 2.7 как есть (без `details`). */
const QUOTA_LINE = {
  type: 'turn.ended',
  agentId: 'main',
  turnId: 2,
  reason: 'failed',
  error: {
    code: 'provider.api_error',
    message:
      "You've reached your 5-hour usage limit. Your quota will reset when the current 5-hour window ends.",
    name: 'APIProviderQuotaExhaustedError',
    retryable: false,
  },
  durationMs: 4865,
  time: 2_000,
}

const lines = (...records: object[]) => records.map((one) => JSON.stringify(one)).join('\n')

describe('конец хода по журналу Kimi', () => {
  it('отказ подписки - его слова', () => {
    const end = firstTurnEnd(lines(QUOTA_LINE), 1_000)

    expect(end).toEqual({ reason: 'failed', message: QUOTA_LINE.error.message })
  })

  it('конец до отправки - чужой: прошлый ход не выдаётся за этот', () => {
    expect(firstTurnEnd(lines(QUOTA_LINE), 3_000)).toBeNull()
  })

  it('первый конец после отправки - свой, а не ход, который Kimi начал потом сам', () => {
    const own = { ...QUOTA_LINE, reason: 'completed', error: undefined, time: 2_000 }
    const later = { ...QUOTA_LINE, time: 2_500 }

    expect(firstTurnEnd(lines(own, later), 1_000)?.reason).toBe('completed')
  })

  it('субагенты и обрезанная строка хвоста не мешают', () => {
    const tail = ['n":"turn.ended","agentId":"main"}', lines({ ...QUOTA_LINE, agentId: 'agent-0' })]

    expect(firstTurnEnd(tail.join('\n'), 1_000)).toBeNull()
  })

  it('папка сессии - по последней записи индекса; удалённая - без папки', () => {
    const index = lines(
      { sessionId: SESSION, sessionDir: '/k/a', workDir: '/p' },
      { sessionId: 'session_other', sessionDir: '/k/b', workDir: '/p' },
    )

    expect(sessionDirOf(index, SESSION)).toBe('/k/a')
    expect(sessionDirOf(`${index}\n${lines({ sessionId: SESSION, deleted: true })}`, SESSION)).toBe(
      null,
    )
    expect(sessionDirOf(index, 'session_none')).toBeNull()
  })
})

describe('сбой хода Kimi с диска', () => {
  let home = ''

  afterEach(async () => {
    if (home) await rm(home, { recursive: true, force: true })
  })

  const setUp = async (wire: string) => {
    home = await mkdtemp(join(tmpdir(), 'kimi-home-'))

    const dir = join(home, 'sessions', 'wd_arena', SESSION)

    await mkdir(join(dir, 'agents', 'main'), { recursive: true })
    await writeFile(join(dir, 'agents', 'main', 'wire.jsonl'), wire)
    await writeFile(
      join(home, 'session_index.jsonl'),
      lines({ sessionId: SESSION, sessionDir: dir, workDir: '/p' }),
    )
  }

  it('лимит подписки - словами сервера', async () => {
    await setUp(`${lines({ type: 'turn.prompt', agentId: 'main', time: 1_500 }, QUOTA_LINE)}\n`)

    expect(await kimiTurnFailure(home)(SESSION, 1_000)).toBe(QUOTA_LINE.error.message)
  })

  it('ход кончился сам - сбоя нет', async () => {
    await setUp(lines({ ...QUOTA_LINE, reason: 'completed', error: undefined }))

    expect(await kimiTurnFailure(home)(SESSION, 1_000)).toBeNull()
  })

  it('Kimi не знает сессии - сбоя нет', async () => {
    await setUp(lines(QUOTA_LINE))

    expect(await kimiTurnFailure(home)('session_none', 1_000)).toBeNull()
  })
})
