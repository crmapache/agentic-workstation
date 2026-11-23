import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { ScenarioQueue } from '@shared/scenario-queues'

import { JsonFile } from '../../storage/json-file'
import { QueueBook } from './queue-book'
import type { StoredQueues } from './queue-parse'
import { parseQueue } from './queue-parse'

const queueOf = (id: string, patch: Partial<ScenarioQueue> = {}): ScenarioQueue => ({
  id,
  projectPath: '/p',
  name: id,
  nameSource: 'fallback',
  createdAt: 1,
  activeAt: 1,
  closedAt: 0,
  workdir: { kind: 'project' },
  items: [],
  stopAfterItemId: '',
  hold: null,
  hours: null,
  nap: null,
  ...patch,
})

let dir = ''
let book: QueueBook

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'queue-book-'))
  book = await QueueBook.load(new JsonFile<StoredQueues>(join(dir, 'queues.json')))
})

afterEach(async () => {
  await book.settle()
  await rm(dir, { recursive: true, force: true })
})

describe('queue book', () => {
  it('lists open queues first, the newest on top, closed ones below them', () => {
    book.put(queueOf('old', { createdAt: 10 }))
    book.put(queueOf('new', { createdAt: 30 }))
    book.put(queueOf('closed', { createdAt: 40, closedAt: 50 }))
    book.put(queueOf('middle', { createdAt: 20 }))

    expect(book.all().map((queue) => queue.id)).toEqual(['new', 'middle', 'old', 'closed'])
  })

  it('counts a write as activity, and a quiet one (night sleep, a name from the AI) not', () => {
    book.put(queueOf('q'))

    const touched = book.get('q')?.activeAt ?? 0

    expect(touched).toBeGreaterThan(1)

    book.put({ ...queueOf('q', { name: 'From AI' }), activeAt: 5 }, { quiet: true })

    expect(book.get('q')).toMatchObject({ name: 'From AI', activeAt: 5 })
  })
})

describe('queue on disk', () => {
  it('takes the last thing an older queue remembers as its activity', () => {
    const stored = {
      ...queueOf('q', { createdAt: 10, hold: { reason: 'failed', itemId: 'a', at: 40 } }),
      items: [
        {
          id: 'a',
          scenarioId: 's',
          scope: 'project',
          scenarioName: 'S',
          inputs: {},
          provider: 'claude',
          addedAt: 30,
          runId: '',
          state: 'failed',
          refusal: null,
        },
      ],
      activeAt: undefined,
    }

    expect(parseQueue(stored)?.activeAt).toBe(40)
    expect(parseQueue({ ...stored, activeAt: 70 })?.activeAt).toBe(70)
  })
})
