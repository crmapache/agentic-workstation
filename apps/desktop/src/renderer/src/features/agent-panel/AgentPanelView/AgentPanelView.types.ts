import type { Conversation } from '@shared/conversation'
import type { Project } from '@shared/workspace'

export type CloseWorkingDialogProps = {
  /** Работающая вкладка, которую закрывают клавишей; null - вопроса нет. */
  conversation: Conversation | null
  onConfirm: () => void
  onCancel: () => void
}

export type NoChatsProps = { project: Project }
