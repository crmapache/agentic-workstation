import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'

export type RewindScope = CommandArgs<'conversation.rewind'>['scope']

export type RewindSheetProps = {
  agentId: string
  conversationId: string
  /** К какому сообщению человека откат (UUID строки транскрипта). */
  messageId: string
  /** Черновик поля этого разговора: текст отрезанного сообщения возвращается туда, как в IDE. */
  draftKey: string
  /** Ход идёт: он остановится, а откатить только код нельзя. */
  running: boolean
  /** Сколько сообщений ждёт в очереди: они уходят вместе с откатом. */
  queued: number
  onClose: () => void
}
