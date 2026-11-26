import { it, expect, describe } from 'vitest'

import type { QueueItem, ScenarioQueue, ScenarioQueuesView } from '@shared/scenario-queues'

import { QUEUE } from '../__fixtures__/fake-scenarios'
import { queueWait, queueWire } from './scenario-wire'

const item = (id: string, patch: Partial<QueueItem>): QueueItem => ({
  ...(QUEUE.items[0] as QueueItem),
  id,
  ...patch,
})

const inFolder = (id: string, name: string, items: QueueItem[]): ScenarioQueue => ({
  ...QUEUE,
  id,
  name,
  workdir: { kind: 'project' },
  items,
})

describe('scenario wire', () => {
  const holder = inFolder('q1', 'Deploy', [item('i1', { state: 'failed', scenarioName: 'Ship' })])
  const working = inFolder('q2', 'Fix', [item('i2', { state: 'running' })])
  const first = inFolder('q3', 'Next', [item('i3', { state: 'waiting', runId: '' })])
  const second = inFolder('q4', 'Later', [item('i4', { state: 'waiting', runId: '' })])
  const view: ScenarioQueuesView = {
    queues: [holder, working, first, second],
    live: [],
    folders: [{ projectPath: QUEUE.projectPath, holders: ['q1', 'q2'], line: ['q3', 'q4'] }],
  }

  it('tells the phone whom a queue waits for, what is left unfinished and how many are ahead', () => {
    expect(queueWait(second, view)).toEqual({
      holders: [
        { queueId: 'q1', name: 'Deploy', unfinished: 'Ship' },
        { queueId: 'q2', name: 'Fix', unfinished: '' },
      ],
      ahead: 1,
    })
    expect(queueWait(holder, view)).toBeNull()
  })

  it('sends the wait with the queue', () => {
    const keyOf = () => 'key'

    expect(queueWire(first, keyOf, keyOf, view).wait?.ahead).toBe(0)
    expect(queueWire(holder, keyOf, keyOf, view).wait).toBeNull()
  })
})
