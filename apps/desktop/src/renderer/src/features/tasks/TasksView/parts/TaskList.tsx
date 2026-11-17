import styles from '../TasksView.module.scss'
import type { TaskListProps } from '../TasksView.types'
import { lastRunOf } from '../TasksView.utils'
import { TaskRow } from './TaskRow'

/** Задания открытого проекта строками; у поручения - сводка его живой жизни. */
export const TaskList = ({ tasks, runs, goals, now }: TaskListProps) => (
  <div className={styles.list}>
    {tasks.map((task) => (
      <TaskRow
        key={task.id}
        task={task}
        lastRun={lastRunOf(runs, task.id)}
        life={goals.find((goal) => goal.taskId === task.id) ?? null}
        now={now}
      />
    ))}
  </div>
)
