import type { TaskEntry } from '@shared/conversation-feed'

/** Подпись задачи: «что делаю сейчас» (activeForm) - только пока работа правда идёт. */
export const taskText = (task: TaskEntry, isWorking: boolean): string =>
  task.state === 'in_progress' && isWorking && task.activeForm ? task.activeForm : task.subject
