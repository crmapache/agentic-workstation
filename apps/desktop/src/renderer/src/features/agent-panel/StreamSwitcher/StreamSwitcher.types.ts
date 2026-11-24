import type { Conversation } from '@shared/conversation'
import type { FeedItem, ToolFeedItem } from '@shared/conversation-feed'

export type StreamSwitcherProps = {
  conversation: Conversation
  items: readonly FeedItem[]
}

/** Фоновая задача процесса CLI, а не агент: команда Bash или наблюдатель Monitor. */
export type ShellKind = 'command' | 'monitor'

/** Фоновая задача процесса для чипа: команда оболочки или адрес сокета (одно из двух) и зачем она. */
export type ShellTask = { kind: ShellKind; command: string; url: string; description: string }

/** Что останавливают: задачу CLI, её вид (агент, команда, наблюдатель) и о чём она - для вопроса. */
export type StopTarget = { taskId: string; kind: 'agent' | ShellKind; subject: string }

export type AgentChipProps = {
  tool: ToolFeedItem
  isActive: boolean
  onPick: (itemId: string) => void
  /** null - провайдер фоновые задачи не останавливает: крестика нет. */
  onStop: ((target: StopTarget) => void) | null
}

export type CommandChipProps = {
  tool: ToolFeedItem
  /** null - провайдер фоновые задачи не останавливает: крестика нет. */
  onStop: ((target: StopTarget) => void) | null
}

export type CommandViewProps = {
  /** Команда или адрес сокета наблюдателя и зачем она - слова модели из вызова. */
  shell: ShellTask
  /** С какого момента идёт (мс); 0 - не известно, времени не будет. */
  startedAt: number
  /** Остановить - тем же вопросом, что крестик чипа; null - CLI не назвал задачу. */
  onStop: (() => void) | null
}

export type StopTaskDialogProps = {
  conversationId: string
  target: StopTarget
  onClose: () => void
}

export type WakeupChipProps = {
  tool: ToolFeedItem
}

export type WakeCountdownProps = {
  /** Когда CLI разбудит агента (мс). */
  dueAt: number
}

export type ChipClockProps = {
  /** С какого момента считать (мс); 0 - не известно, времени не будет. */
  startedAt: number
}
