import type { ComputerInvokeContract } from '@shared/ipc/computer.contract'
import type { WalkthroughInvokeContract } from '@shared/ipc/walkthrough.contract'

import { askComputerPermission } from '../computer/computer-access'
import type { ComputerRuntime } from '../computer/computer-runtime'
import type { InvokeHandlers } from './handle'
import { assertOneOf } from './validate'

type ComputerChannels = keyof ComputerInvokeContract | keyof WalkthroughInvokeContract

const ACTIONS = ['pause', 'resume', 'stop'] as const

const PERMISSIONS = ['accessibility', 'screen'] as const

/**
 * Каналы Computer Use (ADR 0057): кнопки капсулы, запрос разрешений macOS и метки показа
 * Walkthrough поверх экрана (ADR 0134) - его окно Computer Use держит само.
 */
export const createComputerHandlers = (
  computer: ComputerRuntime,
): Pick<InvokeHandlers, ComputerChannels> => ({
  'computer:capsule': () => computer.capsuleView(),
  'computer:control': ({ action }) => computer.control(assertOneOf(action, ACTIONS, 'action')),
  'computer:allow': ({ permission }) =>
    askComputerPermission(assertOneOf(permission, PERMISSIONS, 'permission')),
  'walkthrough:view': () => computer.walkthroughView(),
})
