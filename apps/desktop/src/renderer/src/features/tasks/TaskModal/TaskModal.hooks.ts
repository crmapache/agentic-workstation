import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { TaskDraft } from '@shared/tasks'

import { useTaskActions } from '../tasks.actions'
import { useTasksStore } from '../tasks.store'
import type { Choice, ScheduleForm } from '../tasks.types'
import { formOf, draftOf, blankDraft, scheduleOf } from '../tasks.utils'
import { useTaskRunStore } from '../../../state/task-run.store'
import { useTasks } from '../../../state/tasks.queries'
import { useWorkspace, useActiveProject } from '../../../state/workspace.queries'

/**
 * Форма задания: черновик и ритм формы, проекты на выбор (открытые, дом и недавние), сохранить
 * и удалить. Новое задание встаёт в проект открытой вкладки. Удаление - вторым нажатием.
 */
export const useTaskForm = (taskId: string | null) => {
  const { t } = useTranslation()
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
  const projects: Choice[] = [
    ...(workspace?.projects ?? []),
    ...(workspace?.recentProjects ?? []),
  ].map((project) => ({
    value: project.rootPath,
    label: 'home' in project && project.home ? t('tasks.row.home') : project.name,
    description: project.rootPath,
  }))
  // Папка задания, которой уже нет среди проектов, остаётся в списке: иначе её не увидеть.
  const choices =
    projects.some((one) => one.value === draft.projectPath) || !draft.projectPath
      ? projects
      : [...projects, { value: draft.projectPath, label: draft.projectPath }]

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
    choices,
    removing,
    canSave: Boolean(draft.name.trim() && draft.prompt.trim() && draft.projectPath),
    change,
    changeSchedule,
    save,
    remove,
    close,
  }
}
