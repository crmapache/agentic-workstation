import { useRef, useState, useEffect } from 'react'

import type { TaskAuthored, TaskAuthorOutcome } from '@shared/task-author'
import type { TaskDraft } from '@shared/tasks'

import { useTaskActions } from '../tasks.actions'
import { useTasksStore } from '../tasks.store'
import type { ScheduleForm } from '../tasks.types'
import { formOf, draftOf, blankDraft, scheduleOf } from '../tasks.utils'
import { invoke } from '../../../lib/ipc'
import { useTaskRunStore } from '../../../state/task-run.store'
import { useTasks } from '../../../state/tasks.queries'
import { useWorkspace, useActiveProject } from '../../../state/workspace.queries'
import type { AuthorFailure, AuthorWriting } from './TaskModal.types'

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

  /** Задание от ИИ - в форму поверх черновика: проект, модель и разрешения остаются за человеком. */
  const apply = (authored: TaskAuthored) => {
    setDraft((current) => ({ ...current, ...authored }))
    setSchedule(formOf(authored.schedule, Date.now()))
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
    apply,
    save,
    remove,
    close,
  }
}

/**
 * Отказ IPC - тоже ответ, а не вечное «пишет». Словами окна, кодом: текст исключения главного
 * процесса (он по-русски) в английский интерфейс не попадает, а уходит в журнал.
 */
const askAuthor = async (request: () => Promise<TaskAuthorOutcome>): Promise<TaskAuthorOutcome> => {
  try {
    return await request()
  } catch (error) {
    console.warn('[tasks] ИИ не написал задание:', error)

    return { ok: false, cancelled: false, error: 'failed', detail: '' }
  }
}

/**
 * Вкладка «With AI»: слова человека, ИИ пишет по ним задание, написанное уходит в форму
 * (onWritten) - сохраняет человек. Ответ кладётся, только если запрос всё ещё тот: остановленный
 * не должен переписать форму, которую человек уже правит. Окно закрыли, пока ИИ пишет, -
 * запрос отменяется: открыть написанное уже некуда.
 */
export const useTaskAuthor = (projectPath: string, onWritten: (task: TaskAuthored) => void) => {
  const projectId = useWorkspace().data?.projects.find(
    (project) => project.rootPath === projectPath,
  )?.id
  const [description, setDescription] = useState('')
  const [writing, setWriting] = useState<AuthorWriting | null>(null)
  const [failure, setFailure] = useState<AuthorFailure | null>(null)
  const asking = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (asking.current) void invoke('tasks:cancelAuthor', { authorId: asking.current })
    },
    [],
  )

  const write = async () => {
    const text = description.trim()

    if (!text || !projectId || asking.current) return

    const id = crypto.randomUUID()

    asking.current = id
    setWriting({ id, since: Date.now() })
    setFailure(null)

    const outcome = await askAuthor(() =>
      invoke('tasks:author', { projectId, authorId: id, description: text }),
    )

    if (asking.current !== id) return

    asking.current = null
    setWriting(null)

    if (outcome.ok) onWritten(outcome.task)
    else if (!outcome.cancelled) setFailure({ error: outcome.error, detail: outcome.detail })
  }

  const stop = () => {
    const id = asking.current

    if (!id) return

    asking.current = null
    setWriting(null)
    void invoke('tasks:cancelAuthor', { authorId: id })
  }

  return {
    description,
    writing,
    failure,
    canWrite: Boolean(description.trim() && projectId),
    describe: setDescription,
    write: () => void write(),
    stop,
  }
}
