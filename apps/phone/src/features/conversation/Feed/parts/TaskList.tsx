import { useState } from 'react'
import { ListTodo } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { FeedTaskWire } from '@agentic-workstation/remote-protocol/wire-types'
import { ChoiceMark } from '@agentic-workstation/ui/ChoiceMark'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../Feed.constants'
import styles from '../Feed.module.scss'

/** Список дел модели строкой «Tasks 2 of 5» и что делается сейчас; пункты - по нажатию. */
export const TaskList = ({ tasks }: { tasks: FeedTaskWire[] }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const done = tasks.filter((task) => task.state === 'completed').length
  const current = tasks.find((task) => task.state === 'in_progress')

  return (
    <div className={styles.toolItem}>
      <Disclosure size="touch" expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        <ListTodo size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
        <span className={styles.toolName}>{t('feed.tasks', { done, total: tasks.length })}</span>
        {current && (
          <span className={styles.toolSummary}>{current.activeForm || current.subject}</span>
        )}
      </Disclosure>
      {isOpen && (
        <ul className={styles.tasks}>
          {tasks.map((task) => (
            <li key={task.id} className={styles.task}>
              <ChoiceMark shape="square" tone="success" checked={task.state === 'completed'} />
              {task.subject}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
