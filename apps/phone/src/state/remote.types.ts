import type { InventoryMessage } from '@agentic-workstation/remote-protocol/agent-messages'

/** Инвентарь IDE и когда он пришёл: по разнице с часами IDE (at) считается «с какого времени». */
export type MirroredInventory = InventoryMessage & { receivedAt: number }

/** Пара с IDE для экранов - без ключей. */
export type MachineView = {
  agentId: string
  label: string
  fingerprint: string
  pairedAt: number
  revoked: boolean
}
