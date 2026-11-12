import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'
import type { PendingWire } from '@agentic-workstation/remote-protocol/wire-types'

export type Decision = CommandArgs<'conversation.respond'>['decision']

export type PendingCardProps = {
  pending: PendingWire
  /** Сколько вопросов стоит в очереди хода вместе с этим. */
  pendingCount: number
  busy: boolean
  onDecide: (requestId: string, decision: Decision) => void
  /** Закрыть вопрос с вариантами, не ответив (как «Dismiss» у карточки панели IDE). */
  onDismiss: (requestId: string) => void
}

export type PendingOf<K extends PendingWire['kind']> = Extract<PendingWire, { kind: K }>
