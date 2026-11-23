import { it, expect, describe } from 'vitest'

import type { GatewayServer } from './gateway'
import { grantedServer } from './granted'

const tool = (name: string) => ({ name, inputSchema: { type: 'object' as const } })

const inner: GatewayServer = {
  instructions: () => 'guide',
  tools: () => Promise.resolve([tool('open'), tool('type'), tool('snapshot')]),
  call: (name) => Promise.resolve({ content: [{ type: 'text', text: `ran ${name}` }] }),
}

describe('granted server', () => {
  const server = grantedServer(inner, ['open', 'snapshot'])

  it('lists only granted tools', async () => {
    expect((await server.tools()).map((one) => one.name)).toEqual(['open', 'snapshot'])
    expect(server.instructions()).toBe('guide')
  })

  it('runs a granted tool and refuses the rest without calling it', async () => {
    const signal = new AbortController().signal

    expect(await server.call('open', {}, signal)).toEqual({
      content: [{ type: 'text', text: 'ran open' }],
    })
    expect((await server.call('type', {}, signal)).isError).toBe(true)
  })
})
