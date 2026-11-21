import type { Conversation } from '@shared/conversation'
import type { TaskEntry } from '@shared/conversation-feed'
import type { Project } from '@shared/workspace'

export type ConversationDockProps = {
  project: Project
  conversation: Conversation
  tasks: readonly TaskEntry[]
  /** В разговоре что-то идёт: ход, фоновые агенты или команда (крутилка идущей задачи). */
  isWorking: boolean
}
