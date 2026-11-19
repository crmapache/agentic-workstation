import { useRef, useState, useEffect } from 'react'
import { ListTodo } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { FeedTaskWire } from '@agentic-workstation/remote-protocol/wire-types'
import { ChoiceMark } from '@agentic-workstation/ui/ChoiceMark'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../Feed.constants'
import styles from '../Feed.module.scss'

/**
 * Список дел модели - плиткой в конце ленты, как над полем в панели IDE: шапка «Tasks 2 of 5» и
 * что делается сейчас, пункты - по нажатию. Раскрытые пункты встают в виду: плитка стоит у самого
 * поля ввода, и без прокрутки они раскрывались бы под ним. Отметка пункта стоит у первой строки
 * его текста, а не посередине длинного пункта.
 */
export const TaskList = ({ tasks }: { tasks: FeedTaskWire[] }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const tileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) tileRef.current?.scrollIntoView({ block: 'nearest' })
  }, [isOpen])

  const done = tasks.filter((task) => task.state === 'completed').length
  const current = tasks.find((task) => task.state === 'in_progress')

  return (
    <div ref={tileRef} className={styles.taskTile}>
      <Disclosure size="md" expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        <ListTodo
          className={styles.taskIcon}
          size={ROW_ICON_SIZE}
          strokeWidth={ROW_ICON_STROKE}
          aria-hidden
        />
        <span className={styles.toolName}>{t('feed.tasks', { done, total: tasks.length })}</span>
        {current && (
          <span className={styles.taskCurrent}>{current.activeForm || current.subject}</span>
        )}
      </Disclosure>
      {isOpen && (
        <ul className={styles.tasks}>
          {tasks.map((task) => (
            <li key={task.id} className={styles.task}>
              <span className={styles.taskMark}>
                <ChoiceMark shape="square" tone="success" checked={task.state === 'completed'} />
              </span>
              <span className={styles.taskSubject}>{task.subject}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
