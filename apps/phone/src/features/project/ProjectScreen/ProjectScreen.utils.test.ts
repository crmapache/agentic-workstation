import { it, expect, describe } from 'vitest'

import type {
  QueueWire,
  ConversationSummary,
} from '@agentic-workstation/remote-protocol/wire-types'

import { openQueues, waitingCount, groupByProvider } from './ProjectScreen.utils'

const conversation = (id: string, provider: string): ConversationSummary => ({
  id,
  provider,
  title: id,
  status: 'idle',
  outcome: 'none',
  since: 0,
  waiting: null,
})

const queue = (id: string, closedAt = 0): QueueWire => ({
  id,
  projectKey: 'p-x',
  name: id,
  createdAt: 0,
  closedAt,
  workdir: { kind: 'project' },
  items: [
    {
      id: 'i',
      scenarioId: 's',
      scope: 'project',
      scenarioName: 'S',
      inputs: {},
      provider: 'claude',
      afterSuccess: false,
      addedAt: 0,
      runId: '',
      state: 'waiting',
      refusal: null,
    },
  ],
  stopAfterItemId: '',
  hold: null,
  acknowledgedItemId: '',
})

describe('проект на телефоне', () => {
  it('разговоры - по провайдерам в порядке IDE, незнакомый - своим id в конце', () => {
    const groups = groupByProvider(
      [conversation('a', 'other'), conversation('b', 'claude'), conversation('c', 'claude')],
      [
        {
          id: 'claude',
          label: 'Claude Code',
          available: true,
          models: [],
          efforts: [],
          permissionModes: [],
        },
      ],
    )

    expect(groups.map((group) => [group.label, group.items.length])).toEqual([
      ['Claude Code', 2],
      ['other', 1],
    ])
  })

  it('очереди: только открытые, с идущим прогоном - первыми', () => {
    const live = [{ queueId: 'busy' }] as Parameters<typeof openQueues>[1]

    expect(
      openQueues([queue('idle'), queue('closed', 5), queue('busy')], live).map((one) => one.id),
    ).toEqual(['busy', 'idle'])
    expect(waitingCount(queue('x'))).toBe(1)
  })
})
