import { Plus, CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { TASK_TABS, CLOCK_TICK_MS } from '../tasks.constants'
import { useTasksStore } from '../tasks.store'
import { TaskModal } from '../TaskModal/TaskModal'
import { TaskRunModal } from '../TaskRunModal/TaskRunModal'
import { useNow } from '../../../lib/now.hooks'
import { useTaskRunStore } from '../../../state/task-run.store'
import { useTasks } from '../../../state/tasks.queries'
import { useActiveProject } from '../../../state/workspace.queries'
import styles from './TasksView.module.scss'
import { RunList } from './parts/RunList'
import { TaskList } from './parts/TaskList'

/**
 * Задания (ADR 0069) и поручения (ADR 0080) - вид середины окна: задания открытого проекта и их
 * прогоны. Задание принадлежит проекту, как очередь (ADR 0072): чужие здесь не видны, а идут
 * сами. Задание правится окном по центру, прогон - своим окном с отчётом и разговором.
 */
export const TasksView = () => {
  const { t } = useTranslation()
  const { data } = useTasks()
  const project = useActiveProject()
  const tab = useTasksStore((state) => state.tab)
  const setTab = useTasksStore((state) => state.setTab)
  const editing = useTasksStore((state) => state.editing)
  const edit = useTasksStore((state) => state.edit)
  const runId = useTaskRunStore((state) => state.runId)
  const now = useNow(true, CLOCK_TICK_MS)
  const root = project?.rootPath
  const tasks = (data?.tasks ?? [])
    .filter((task) => task.projectPath === root)
    .sort((left, right) => left.name.localeCompare(right.name))
  const runs = (data?.runs ?? []).filter((run) => run.projectPath === root)
  const counts = { tasks: tasks.length, runs: runs.length }
  const tabs = TASK_TABS.map((id) => ({ id, label: t(`tasks.tabs.${id}`), count: counts[id] }))
  const newButton = (
    <Button icon={Plus} onClick={() => edit(null)}>
      {t('tasks.actions.new')}
    </Button>
  )

  return (
    <div className={styles.view}>
      <PageHeader
        icon={CalendarClock}
        title={t('tasks.title')}
        help={
          <HelpButton
            label={t('tasks.help.label')}
            title={t('tasks.help.title')}
            text={t('tasks.help.text')}
            closeLabel={t('common.close')}
          />
        }
        actions={newButton}
        toolbar={<Tabs label={t('tasks.tabs.label')} items={tabs} value={tab} onChange={setTab} />}
      />
      <div className={styles.scroller}>
        <div className={styles.page}>
          {tab === 'runs' ? (
            <RunList runs={runs} now={now} />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={t('tasks.empty.title')}
              description={t('tasks.empty.note')}
              action={newButton}
            />
          ) : (
            <TaskList tasks={tasks} runs={runs} goals={data?.goals ?? []} now={now} />
          )}
        </div>
      </div>
      {editing !== undefined && <TaskModal taskId={editing} />}
      {runId && <TaskRunModal runId={runId} />}
    </div>
  )
}
