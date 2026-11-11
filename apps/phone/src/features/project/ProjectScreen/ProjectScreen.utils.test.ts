import { it, expect, describe } from 'vitest'

import type { ConversationSummary } from '@agentic-workstation/remote-protocol/wire-types'

import { groupByProvider } from './ProjectScreen.utils'

const conversation = (id: string, provider: string): ConversationSummary => ({
  id,
  provider,
  title: id,
  status: 'idle',
  outcome: 'none',
  since: 0,
  waiting: null,
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
})
