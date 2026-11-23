import { useState } from 'react'
import { clsx } from 'clsx'
import { Plus, Send, Pencil, Trash2, ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useTrackerActions } from '../tracker.actions'
import { useTrackerStore } from '../tracker.store'
import { queueCardsOf } from '../tracker.utils'
import { ActionsMenu } from '../ActionsMenu/ActionsMenu'
import type { ActionItem } from '../ActionsMenu/ActionsMenu.types'
import { useBoard } from '../Board/Board.context'
import { QuickAdd } from '../QuickAdd/QuickAdd'
import { TaskRow } from '../TaskRow/TaskRow'
import styles from './GroupColumn.module.scss'
import type { GroupColumnProps } from './GroupColumn.types'

/**
 * Группа задач - колонка в порядке работы: шапка (тянется за неё же), задачи сверху вниз с
 * продолжениями справа и быстрое добавление внизу. Шапка - первая строка общей сетки ряда: у
 * колонок одного потока она одной высоты, и первые задачи стоят на одной линии. Всю группу в
 * очередь шлёт пункт её меню, как и карточку.
 */
export const GroupColumn = ({ group, flowId }: GroupColumnProps) => {
  const { t } = useTranslation()
  const { press, draggingId, moveBy } = useBoard()
  const { apply } = useTrackerActions()
  const edit = useTrackerStore((state) => state.edit)
  const openSend = useTrackerStore((state) => state.openSend)
  const [adding, setAdding] = useState(false)
  const source = { kind: 'group' as const, id: group.id }
  // Одни пометки - не очередь: запускать в ней нечего.
  const canSend = queueCardsOf(group).some((card) => card.scenario)
  const items: ActionItem[] = [
    {
      key: 'edit',
      icon: Pencil,
      label: t('tracker.group.edit'),
      onSelect: () => edit({ kind: 'group', id: group.id, flowId }),
    },
    {
      key: 'send',
      icon: Send,
      label: t('tracker.group.send'),
      disabled: !canSend,
      onSelect: () => openSend({ kind: 'group', groupId: group.id }),
    },
    {
      key: 'left',
      icon: ArrowLeft,
      label: t('tracker.group.moveLeft'),
      onSelect: () => moveBy(source, -1),
    },
    {
      key: 'right',
      icon: ArrowRight,
      label: t('tracker.group.moveRight'),
      onSelect: () => moveBy(source, 1),
    },
    {
      key: 'delete',
      icon: Trash2,
      label: t('tracker.group.delete'),
      danger: true,
      onSelect: () => void apply({ kind: 'group.delete', id: group.id }),
    },
  ]

  const handleAdd = async (title: string) =>
    (await apply({ kind: 'card.create', groupId: group.id, fields: { title } })).ok

  return (
    <section
      className={clsx(styles.column, draggingId === group.id && styles.dragging)}
      data-group-column={group.id}
      data-flow-id={flowId}
      aria-label={group.title}>
      <header className={styles.header} onMouseDown={(event) => press(event, source)}>
        <button
          type="button"
          className={styles.heading}
          onClick={() => edit({ kind: 'group', id: group.id, flowId })}>
          <span className={styles.title}>{group.title}</span>
          {group.subtitle && <span className={styles.subtitle}>{group.subtitle}</span>}
        </button>
        <ActionsMenu label={t('tracker.group.menu')} items={items} />
      </header>
      <div className={styles.body} data-group-body="">
        {group.tasks.map((task) => (
          <TaskRow key={task.id} task={task} groupId={group.id} />
        ))}
        <div className={styles.end} data-group-end="">
          {adding ? (
            <QuickAdd
              placeholder={t('tracker.card.taskPlaceholder')}
              onAdd={handleAdd}
              onClose={() => setAdding(false)}
            />
          ) : (
            <Button variant="dashed" size="sm" icon={Plus} onClick={() => setAdding(true)}>
              {t('tracker.group.addTask')}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
