import type { TaskDraft } from '@shared/tasks'
import type { TasksInvokeContract } from '@shared/ipc/tasks.contract'

import type { TaskAuthor } from '../tasks/task-author'
import type { TaskService } from '../tasks/task-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { InvokeHandlers } from './handle'
import { assertId } from './scenarios-validate'
import { assertString } from './validate'
import { projectRootOf } from './workspace-handlers'

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

/** Слова человека для автора заданий: не пусто и не больше текста задания. */
const descriptionOf = (value: unknown): string => {
  assertString(value, 'description')

  if (!value.trim()) throw new Error('Пустое описание задания')

  return value.slice(0, 20_000)
}

/**
 * Каналы заданий по расписанию (ADR 0069): проверить запрос и позвать сервис. Автор пишет
 * задание для открытого проекта - папку берём у проекта, а не из окна.
 */
export const createTasksHandlers = (
  workspace: WorkspaceService,
  tasks: TaskService,
  author: TaskAuthor,
): Pick<InvokeHandlers, TasksChannels> => ({
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
  'tasks:author': ({ projectId, authorId, description }) =>
    author.write(
      projectRootOf(workspace, projectId),
      assertId(authorId, 'authorId'),
      descriptionOf(description),
    ),
  'tasks:cancelAuthor': ({ authorId }) => author.cancel(assertId(authorId, 'authorId')),
})
