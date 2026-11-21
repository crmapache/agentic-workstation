import { useState } from 'react'
import clsx from 'clsx'
import { ListTodo } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Disclosure } from '@agentic-workstation/ui/Disclosure'
import { Spinner } from '@agentic-workstation/ui/Spinner'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../panel.constants'
import { STATE_ICON, PAUSED_ICON, STATE_CLASS } from './TaskListPanel.constants'
import styles from './TaskListPanel.module.scss'
import type { TaskListPanelProps } from './TaskListPanel.types'
import { taskText } from './TaskListPanel.utils'

/**
 * Список задач, который ведёт модель, - над полем ввода: видно, где она сейчас и
 * сколько осталось. Свёрнутый - одна строка с текущей задачей. Идущая задача крутится,
 * только пока в разговоре что-то идёт; модель кончила ход, не закрыв её, - пауза: иначе
 * человек ждал бы работы, которой нет.
 */
export const TaskListPanel = ({ tasks, isWorking }: TaskListPanelProps) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(true)
  const done = tasks.filter((task) => task.state === 'completed').length
  const current = tasks.find((task) => task.state === 'in_progress')
  const paused = t('agentPanel.tasks.paused')

  const handleToggle = () => setIsOpen((value) => !value)

  return (
    <section aria-label={t('agentPanel.tasks.title')} className={styles.taskListPanel}>
      <Disclosure size="md" expanded={isOpen} onClick={handleToggle}>
        <ListTodo
          className={styles.icon}
          size={ROW_ICON_SIZE}
          strokeWidth={ROW_ICON_STROKE}
          aria-hidden
        />
        <span className={styles.caption}>{t('agentPanel.tasks.title')}</span>
        <span className={styles.progress}>
          {t('agentPanel.tasks.progress', { done, total: tasks.length })}
        </span>
        {!isOpen && current && (
          <span className={styles.current}>{taskText(current, isWorking)}</span>
        )}
      </Disclosure>
      {isOpen && (
        <ul className={styles.list}>
          {tasks.map((task) => {
            const isCurrent = task.state === 'in_progress'
            const isPaused = isCurrent && !isWorking
            const Icon = task.state === 'in_progress' ? null : STATE_ICON[task.state]

            return (
              <li key={task.id} className={clsx(styles.task, styles[STATE_CLASS[task.state]])}>
                <span className={clsx(styles.taskIcon, isPaused && styles.paused)}>
                  {isPaused ? (
                    <Tooltip label={paused} placement="top">
                      <PAUSED_ICON
                        size={ROW_ICON_SIZE}
                        strokeWidth={ROW_ICON_STROKE}
                        role="img"
                        aria-label={paused}
                      />
                    </Tooltip>
                  ) : Icon ? (
                    <Icon size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
                  ) : (
                    <Spinner />
                  )}
                </span>
                <span className={styles.subject}>{taskText(task, isWorking)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
