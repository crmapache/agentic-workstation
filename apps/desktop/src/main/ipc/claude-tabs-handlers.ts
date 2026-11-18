import type { ClaudeTabsInvokeContract } from '@shared/ipc/claude-tabs.contract'

import { setPanelFocused } from '../agents/tabs/panel-focus'
import type { InvokeHandlers } from './handle'

type TabChannels = Exclude<keyof ClaudeTabsInvokeContract, `git:${string}`>

/** Фокус панели провайдера: ⌘W и ⌘R меню отдаёт панели, пока фокус в ней. */
export const createClaudeTabsHandlers = (): Pick<InvokeHandlers, TabChannels> => ({
  'claude:setPanelFocus': ({ focused }) => setPanelFocused(focused === true),
})
