import { useState } from 'react'

import type { TaskDraft } from '@shared/tasks'

import { useTaskActions } from '../tasks.actions'
import { useTasksStore } from '../tasks.store'
import type { ScheduleForm } from '../tasks.types'
import { formOf, draftOf, blankDraft, scheduleOf } from '../tasks.utils'
import { useTaskRunStore } from '../../../state/task-run.store'
import { useTasks } from '../../../state/tasks.queries'
import { useWorkspace, useActiveProject } from '../../../state/workspace.queries'

/**
 * Форма задания: черновик и ритм формы, сохранить и удалить. Задание принадлежит проекту, как
 * очередь: новое встаёт в проект открытой вкладки, правка его не переносит. Удаление - вторым
 * нажатием.
 */
export const useTaskForm = (taskId: string | null) => {
  const task = useTasks().data?.tasks.find((one) => one.id === taskId) ?? null
  const { data: workspace } = useWorkspace()
  const active = useActiveProject()
  const actions = useTaskActions()
  const close = useTasksStore((state) => state.closeEditor)
  const closeRun = useTaskRunStore((state) => state.close)
  const [draft, setDraft] = useState<TaskDraft>(() =>
    task ? draftOf(task) : blankDraft(active?.rootPath ?? workspace?.projects[0]?.rootPath ?? ''),
  )
  const [schedule, setSchedule] = useState<ScheduleForm>(() => formOf(draft.schedule, Date.now()))
  const [removing, setRemoving] = useState(false)
  const change = (patch: Partial<TaskDraft>) => setDraft((current) => ({ ...current, ...patch }))

  const changeSchedule = (next: ScheduleForm) => {
    setSchedule(next)
    change({ schedule: scheduleOf(next) })
  }

  const save = async () => {
    if (await actions.save({ ...draft, schedule: scheduleOf(schedule) })) close()
  }

  const remove = async () => {
    if (!task) return
    if (!removing) return setRemoving(true)

    if (await actions.remove(task.id)) {
      closeRun()
      close()
    }
  }

  return {
    task,
    draft,
    schedule,
    removing,
    canSave: Boolean(draft.name.trim() && draft.prompt.trim() && draft.projectPath),
    change,
    changeSchedule,
    save,
    remove,
    close,
  }
}
