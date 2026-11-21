import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useTrackerActions } from '../tracker.actions'
import { CardTile } from '../CardTile/CardTile'
import { QuickAdd } from '../QuickAdd/QuickAdd'
import styles from './TaskRow.module.scss'
import type { TaskRowProps } from './TaskRow.types'

/**
 * Задача и её продолжения слева направо. После последней карточки - место конца цепочки: туда
 * кладут перенесённую карточку и там же «+» добавляет следующее продолжение.
 */
export const TaskRow = ({ task, groupId }: TaskRowProps) => {
  const { t } = useTranslation()
  const { apply } = useTrackerActions()
  const [adding, setAdding] = useState(false)

  const handleAdd = async (title: string) =>
    (await apply({ kind: 'card.create', groupId, followUpOf: task.id, fields: { title } })).ok

  return (
    <div className={styles.row}>
      <CardTile card={task} groupId={groupId} followUp={false} rootId={task.id} />
      {task.followUps.map((card) => (
        <CardTile key={card.id} card={card} groupId={groupId} followUp rootId={task.id} />
      ))}
      <div className={styles.chainEnd} data-chain={task.id} data-group={groupId}>
        {adding ? (
          <QuickAdd
            placeholder={t('tracker.card.followUpPlaceholder')}
            onAdd={handleAdd}
            onClose={() => setAdding(false)}
          />
        ) : (
          <span className={styles.add}>
            <IconButton
              icon={Plus}
              size="xs"
              label={t('tracker.card.addFollowUpHere', { title: task.title })}
              onClick={() => setAdding(true)}
            />
          </span>
        )}
      </div>
    </div>
  )
}
