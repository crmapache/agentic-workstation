import { it, vi, expect, describe } from 'vitest'

import type { ConversationRuntime } from './conversation-runtime'
import { connectorsLaunch } from './spawn'

describe('connectorsLaunch', () => {
  it('конфиг коннекторов не записался - процесс без них, лента говорит об этом', async () => {
    const addNotice = vi.fn()
    const runtime = {
      meta: { projectPath: '/p' },
      host: { mcpConfig: () => Promise.reject(new Error('ENOSPC')) },
      feed: { builder: { addNotice } },
    } as unknown as ConversationRuntime

    expect(await connectorsLaunch(runtime)).toBeNull()
    expect(addNotice).toHaveBeenCalledWith('connectors-missing', '')
  })
})
