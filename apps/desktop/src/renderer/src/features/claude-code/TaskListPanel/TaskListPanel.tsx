import { useState } from 'react'
import clsx from 'clsx'
import { ListTodo } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Disclosure } from '@agentic-workstation/ui/Disclosure'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../claude.constants'
import { STATE_ICON, STATE_CLASS } from './TaskListPanel.constants'
import styles from './TaskListPanel.module.scss'
import type { TaskListPanelProps } from './TaskListPanel.types'

/**
 * Список задач, который ведёт модель, - над полем ввода: видно, где она сейчас и
 * сколько осталось. Свёрнутый - одна строка с текущей задачей.
 */
export const TaskListPanel = ({ tasks }: TaskListPanelProps) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(true)
  const done = tasks.filter((task) => task.state === 'completed').length
  const current = tasks.find((task) => task.state === 'in_progress')

  const handleToggle = () => setIsOpen((value) => !value)

  return (
    <section aria-label={t('claudeCode.tasks.title')} className={styles.taskListPanel}>
      <Disclosure size="md" expanded={isOpen} onClick={handleToggle}>
        <ListTodo
          className={styles.icon}
          size={ROW_ICON_SIZE}
          strokeWidth={ROW_ICON_STROKE}
          aria-hidden
        />
        <span className={styles.caption}>{t('claudeCode.tasks.title')}</span>
        <span className={styles.progress}>
          {t('claudeCode.tasks.progress', { done, total: tasks.length })}
        </span>
        {!isOpen && current && (
          <span className={styles.current}>{current.activeForm || current.subject}</span>
        )}
      </Disclosure>
      {isOpen && (
        <ul className={styles.list}>
          {tasks.map((task) => {
            const Icon = task.state === 'in_progress' ? null : STATE_ICON[task.state]

            return (
              <li key={task.id} className={clsx(styles.task, styles[STATE_CLASS[task.state]])}>
                <span className={styles.taskIcon}>
                  {Icon ? (
                    <Icon size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
                  ) : (
                    <Spinner />
                  )}
                </span>
                <span className={styles.subject}>
                  {task.state === 'in_progress' && task.activeForm ? task.activeForm : task.subject}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
