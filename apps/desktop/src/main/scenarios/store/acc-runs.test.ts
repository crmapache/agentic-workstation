import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { RunSummary } from '@shared/scenario-runs'

import { AccRuns, withAccRuns, accProjectKey } from './acc-runs'

/**
 * Прогоны плагина ACC в истории IDE: книга ACC читается как есть, старые записи без новых полей
 * не роняют таймлайн, а своя запись IDE с тем же id важнее чужой.
 */

const PROJECT = '/Users/someone/Projects/shop'

let home = ''

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'acc-home-'))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

/** Папка прогона в книге ACC: сводка и запись, как их пишет плагин. */
const putRun = async (id: string, summary: object, record: object) => {
  const folder = join(home, 'scenario-runs', accProjectKey(PROJECT), id)

  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'summary.json'), JSON.stringify(summary))
  await writeFile(join(folder, 'run.json'), JSON.stringify(record))
}

/** Запись ACC до звёзд, стоянок и заметок с автором - как у самых старых прогонов. */
const oldRecord = {
  id: 'aaaa1111bbbb2222',
  scenarioId: 's1',
  scenarioName: 'Plan a card',
  scope: 'project',
  snapshot: { version: 1, id: 's1', name: 'Plan a card', inputs: [], stages: [] },
  startedAt: 1_000,
  finishedAt: 5_000,
  state: 'done',
  inputs: { card: 'https://example.com/card' },
  total: 1,
  headConversationId: '../../../etc/passwd',
  steps: [
    {
      key: 'st:c:1',
      cardId: 'c',
      stageId: 'st',
      pass: 1,
      title: '/plan',
      state: 'done',
      conversationId: '0b8e2c1a-5af5-4ec2-a0c4-4c16ec2ce8f5',
      startedAt: 1_000,
      finishedAt: 4_000,
      slots: {},
      prompt: '/plan',
      said: '',
      summary: 'Planned.',
      nudges: [],
      verdict: 'done',
      verdictReason: '',
      handoff: '',
      failure: '',
      error: '',
      cost: 1,
      tokens: 10,
    },
  ],
  notes: [{ at: 2_000, stepKey: 'st:c:1', text: 'Looks fine.' }],
  question: null,
  failure: '',
  error: '',
  cost: 1,
  tokens: 10,
}

describe('прогоны плагина ACC в истории проекта', () => {
  it('ключ проекта - тот же, что у ACC (ShortHash: SHA-256 в base64url, 16 знаков)', () => {
    // Проверено по настоящей книге ACC: этот путь лежит у плагина под этим ключом.
    expect(accProjectKey('/Users/max/Documents/Projects/roas-radar')).toBe('h8ms604HOb12u4JA')
  })

  it('сводка ACC становится строкой истории с меткой acc и без полей, которых у ACC нет', async () => {
    await putRun(
      'aaaa1111bbbb2222',
      {
        id: 'aaaa1111bbbb2222',
        scenarioId: 's1',
        scenarioName: 'Plan a card',
        scope: 'project',
        startedAt: 1_000,
        finishedAt: 5_000,
        state: 'done',
        total: 1,
        done: 1,
        failure: 'somethingNew',
        cost: 1.5,
        inputs: { card: 'x', broken: 3 },
        tokens: 10,
        stage: 1,
        at: '/plan',
      },
      oldRecord,
    )

    const [summary] = await new AccRuns(PROJECT, home).summaries()

    expect(summary).toMatchObject({
      id: 'aaaa1111bbbb2222',
      projectPath: PROJECT,
      provider: 'claude',
      queueId: '',
      state: 'done',
      failure: '',
      inputs: { card: 'x' },
      roadmap: [],
      starred: false,
      origin: 'acc',
    })
  })

  it('старая запись ACC читается с полями по умолчанию, в папке проекта', async () => {
    await putRun('aaaa1111bbbb2222', { id: 'aaaa1111bbbb2222' }, oldRecord)

    const run = await new AccRuns(PROJECT, home).read('aaaa1111bbbb2222')

    expect(run?.origin).toBe('acc')
    expect(run?.cwd).toBe(PROJECT)
    // Чужой id разговора с путём не проходит: по нему склеивается путь к транскрипту.
    expect(run?.headConversationId).toBe('')
    expect(run?.steps[0]?.conversationId).toBe('0b8e2c1a-5af5-4ec2-a0c4-4c16ec2ce8f5')
    expect(run?.steps[0]).toMatchObject({
      takeOver: '',
      rested: 0,
      item: null,
      summary: 'Planned.',
    })
    expect(run?.notes[0]).toMatchObject({ who: '', deliveredAt: 2_000, relayed: '', move: null })
  })

  it('нет книги ACC или чужой id - пусто, а не ошибка', async () => {
    const acc = new AccRuns(PROJECT, home)

    expect(await acc.summaries()).toEqual([])
    expect(await acc.read('../../etc')).toBeNull()
    expect(await acc.read('aaaa1111bbbb2222')).toBeNull()
  })

  it('история - свежие сверху, тот же id - запись IDE', () => {
    const row = (id: string, startedAt: number, origin: 'ide' | 'acc') =>
      ({ id, startedAt, origin }) as RunSummary

    const merged = withAccRuns(
      [row('both', 3, 'ide'), row('own', 1, 'ide')],
      [row('both', 3, 'acc'), row('theirs', 2, 'acc')],
    )

    expect(merged.map((run) => `${run.id}:${run.origin}`)).toEqual([
      'both:ide',
      'theirs:acc',
      'own:ide',
    ])
  })
})
