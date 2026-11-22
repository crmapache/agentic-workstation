import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useTrackerActions } from '../tracker.actions'
import { CardTile } from '../CardTile/CardTile'
import { QuickAdd } from '../QuickAdd/QuickAdd'
import styles from './TaskRow.module.scss'
import type { TaskRowProps } from './TaskRow.types'

/**
 * Задача и её продолжения слева направо. «+» на последней карточке цепочки открывает справа поле
 * следующего продолжения; без него ряд не держит за цепочкой пустого места, и колонки стоят
 * плотно.
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
    <div className={styles.row}>
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
