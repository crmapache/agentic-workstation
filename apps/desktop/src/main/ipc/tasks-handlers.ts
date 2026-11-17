import type { TaskDraft } from '@shared/tasks'
import type { TasksInvokeContract } from '@shared/ipc/tasks.contract'

import type { TaskService } from '../tasks/task-service'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'

type TasksChannels = keyof TasksInvokeContract

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Задание из окна: только форма записи. Поля разбирает и проверяет сервис (draftToTask) -
 * чужое значение там становится значением по умолчанию или отказом с кодом.
 */
const draftOf = (value: unknown): TaskDraft => {
  if (!isRecord(value)) throw new Error('Задание - объект')

  const { id } = value

  if (id !== null) assertString(id, 'id')

  return value as TaskDraft
}

/** Каналы заданий по расписанию (ADR 0069): проверить запрос и позвать сервис. */
export const createTasksHandlers = (tasks: TaskService): Pick<InvokeHandlers, TasksChannels> => ({
  'tasks:get': () => tasks.view(),
  'tasks:save': ({ task }) => tasks.save(draftOf(task)),
  'tasks:remove': ({ taskId }) => {
    assertString(taskId, 'taskId')

    return tasks.remove(taskId)
  },
  'tasks:setEnabled': ({ taskId, enabled }) => {
    assertString(taskId, 'taskId')

    return tasks.setEnabled(taskId, enabled === true)
  },
  'tasks:runNow': ({ taskId }) => {
    assertString(taskId, 'taskId')

    return tasks.runNow(taskId)
  },
  'tasks:stop': ({ runId }) => {
    assertString(runId, 'runId')

    return tasks.stop(runId)
  },
  'tasks:tell': ({ runId, text }) => {
    assertString(runId, 'runId')
    assertString(text, 'text')

    return tasks.tell(runId, text.slice(0, 20_000))
  },
  'tasks:run': ({ runId }) => {
    assertString(runId, 'runId')

    return tasks.run(runId)
  },
  'tasks:log': ({ runId, earlier, chapter }) => {
    assertString(runId, 'runId')

    return tasks.log(runId, earlier === true, typeof chapter === 'number' ? chapter : null)
  },
  'tasks:goal': ({ runId }) => {
    assertString(runId, 'runId')

    return tasks.goal(runId)
  },
  'tasks:wake': ({ runId }) => {
    assertString(runId, 'runId')

    return tasks.wake(runId)
  },
  'tasks:openChat': ({ runId }) => {
    assertString(runId, 'runId')

    return tasks.openChat(runId)
  },
})
