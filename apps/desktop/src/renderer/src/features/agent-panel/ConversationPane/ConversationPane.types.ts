import type { Conversation } from '@shared/conversation'
import type { Project } from '@shared/workspace'

export type ConversationPaneProps = {
  project: Project
  /** null - у проекта ещё нет разговоров: приветствие и поле, которое заведёт первый. */
  conversation: Conversation | null
}
