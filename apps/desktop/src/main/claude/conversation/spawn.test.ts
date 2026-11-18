import { it, vi, expect, describe } from 'vitest'

import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import type { ClaudeHost } from './claude-conversation'
import { attachClaude } from './claude-conversation'
import { connectorsLaunch } from './spawn'

describe('connectorsLaunch', () => {
  it('конфиг коннекторов не записался - процесс без них, лента говорит об этом', async () => {
    const runtime = { meta: { id: 'c1', projectPath: '/p' } } as unknown as ConversationRuntime
    const host = {
      onFeedPatch: vi.fn(),
      thumbnail: () => '',
      mcpConfig: () => Promise.reject(new Error('ENOSPC')),
    } as unknown as ClaudeHost
    const addNotice = vi.spyOn(attachClaude(runtime, host).feed.builder, 'addNotice')

    expect(await connectorsLaunch(runtime)).toBeNull()
    expect(addNotice).toHaveBeenCalledWith('connectors-missing', '')
  })
})
