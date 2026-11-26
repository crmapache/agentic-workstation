import { it, expect, describe } from 'vitest'

import type { QueueItem, ScenarioQueue } from '@shared/scenario-queues'

import { folderTakers, folderWaitOf } from './queue-folder.utils'

const item = (id: string, state: QueueItem['state']): QueueItem => ({
  id,
  scenarioId: id,
  scope: 'project',
  scenarioName: `Scenario ${id}`,
  inputs: {},
  provider: 'claude',
  addedAt: 1,
  runId: state === 'waiting' ? '' : `r-${id}`,
  state,
  refusal: null,
})

const queueOf = (id: string, ...items: QueueItem[]): ScenarioQueue => ({
  id,
  projectPath: '/p',
  name: id,
  nameSource: 'fallback',
  createdAt: 1,
  activeAt: 1,
  closedAt: 0,
  workdir: { kind: 'project' },
  items,
  stopAfterItemId: '',
  hold: null,
  hours: null,
  nap: null,
  turn: null,
})

describe('queue folder on screen', () => {
  const stuck = queueOf('a', item('a1', 'failed'))
  const working = queueOf('b', item('b1', 'running'))
  const first = queueOf('c', item('c1', 'waiting'))
  const second = queueOf('d', item('d1', 'waiting'))
  const view = {
    queues: [stuck, working, first, second],
    folders: [{ projectPath: '/p', holders: ['a', 'b'], line: ['c', 'd'] }],
  }

  it('says whom a queue waits for, what a holder left unfinished and who is ahead', () => {
    expect(folderWaitOf(view, second)).toEqual({
      holders: [
        { queue: stuck, unfinished: stuck.items[0] },
        { queue: working, unfinished: null },
      ],
      ahead: [first],
    })
    expect(folderWaitOf(view, working)).toBeNull()
    expect(folderWaitOf(undefined, first)).toBeNull()
  })

  it('names who a new queue would wait for: the holders, or else the line', () => {
    expect(folderTakers(view, '/p')).toEqual([stuck, working])
    expect(
      folderTakers({ ...view, folders: [{ projectPath: '/p', holders: [], line: ['c'] }] }, '/p'),
    ).toEqual([first])
    expect(folderTakers(view, '/q')).toEqual([])
  })
})
