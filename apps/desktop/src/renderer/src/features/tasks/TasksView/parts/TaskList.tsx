import { Section } from '@agentic-workstation/ui/Section'

import styles from '../TasksView.module.scss'
import type { TaskListProps } from '../TasksView.types'
import { lastRunOf } from '../TasksView.utils'
import { TaskRow } from './TaskRow'

/** Задания разделами по проектам: проект - заголовок, под ним строки его заданий. */
export const TaskList = ({ groups, runs, now }: TaskListProps) => (
  <>
    {groups.map((group) => (
      <Section key={group.projectPath} size="sm" title={group.name} count={group.tasks.length}>
        <div className={styles.list}>
          {group.tasks.map((task) => (
            <TaskRow key={task.id} task={task} lastRun={lastRunOf(runs, task.id)} now={now} />
          ))}
        </div>
      </Section>
    ))}
  </>
)
