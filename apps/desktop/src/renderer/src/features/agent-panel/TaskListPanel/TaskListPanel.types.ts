import type { TaskEntry } from '@shared/conversation-feed'

export type TaskListPanelProps = {
  tasks: readonly TaskEntry[]
  /** В разговоре что-то идёт: ход, фоновые агенты или команда. Нет - идущая задача стоит. */
  isWorking: boolean
}
