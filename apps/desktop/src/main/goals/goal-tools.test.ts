import { it, expect, describe } from 'vitest'

import { goalServer } from './goal-tools'
import type { GoalToolsPort } from './goal-tools'

const port: GoalToolsPort = {
  wait: (sessionId) => Promise.resolve(`wait ${sessionId}`),
  journal: (sessionId, text) => `journal ${sessionId} ${text}`,
  finish: (sessionId, outcome) => `finish ${sessionId} ${outcome}`,
}

const launch = (conversationId: string | null) => ({
  id: 'l1',
  projectPath: '/p',
  workDir: '/p',
  conversationId,
  released: false,
})

describe('goalServer', () => {
  const server = goalServer(port, (sessionId) => sessionId === 'goal-session')

  it('is there only for a process of a living goal', () => {
    expect(server(launch(null))).toBeNull()
    expect(server(launch('chat-tab'))).toBeNull()
    expect(server(launch('goal-session'))).not.toBeNull()
  })

  it('lists its three tools and calls them for its own conversation', async () => {
    const own = server(launch('goal-session'))
    const tools = await own?.tools()
    const result = await own?.call(
      'journal',
      { text: 'Wrote to Corey' },
      new AbortController().signal,
    )

    expect(tools?.map((tool) => tool.name)).toEqual(['wait', 'journal', 'finish'])
    expect(result?.content[0]).toMatchObject({ text: '"journal goal-session Wrote to Corey"' })
  })
})
