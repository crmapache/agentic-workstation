import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import styles from '../GroupColumn.module.scss'
import type { TaskRowProps } from '../GroupColumn.types'
import { useTrackerActions } from '../../tracker.actions'
import { CardTile } from '../../CardTile/CardTile'
import { QuickAdd } from '../../QuickAdd/QuickAdd'

/**
 * Задача и её продолжения слева направо, от верха задачи. Карточки одной ширины, поэтому k-е
 * продолжения всех задач группы стоят друг под другом, а высокая карточка раздвигает свой ряд.
 * «+» на последней карточке цепочки открывает справа поле следующего продолжения.
 */
export const TaskRow = ({ task, groupId }: TaskRowProps) => {
  const { t } = useTranslation()
  const { apply } = useTrackerActions()
  const [adding, setAdding] = useState(false)
  const lastId = task.followUps.at(-1)?.id ?? task.id

  const handleAdd = async (title: string) =>
    (await apply({ kind: 'card.create', groupId, followUpOf: task.id, fields: { title } })).ok
  const handleOpenAdd = () => setAdding(true)

  return (
    <div className={styles.row} data-task-row="">
      <CardTile
        card={task}
        groupId={groupId}
        followUp={false}
        rootId={task.id}
        onAddFollowUp={lastId === task.id ? handleOpenAdd : undefined}
      />
      {task.followUps.map((card) => (
        <CardTile
          key={card.id}
          card={card}
          groupId={groupId}
          followUp
          rootId={task.id}
          onAddFollowUp={card.id === lastId ? handleOpenAdd : undefined}
        />
      ))}
      {adding && (
        <QuickAdd
          placeholder={t('tracker.card.followUpPlaceholder')}
          onAdd={handleAdd}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}
