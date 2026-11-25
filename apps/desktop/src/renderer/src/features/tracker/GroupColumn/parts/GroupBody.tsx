import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../GroupColumn.module.scss'
import type { GroupBodyProps } from '../GroupColumn.types'
import { useTrackerActions } from '../../tracker.actions'
import { QuickAdd } from '../../QuickAdd/QuickAdd'
import { TaskRow } from './TaskRow'

/**
 * Тело группы: ряды задач сверху вниз (задача и справа её продолжения) и «Add task» под ними.
 * Продолжение стоит на уровне своей задачи, а не своим ходом в отдельном столбике: иначе с
 * несколькими цепочками не видно, что к чему относится (жалоба владельца).
 */
export const GroupBody = ({ group }: GroupBodyProps) => {
  const { t } = useTranslation()
  const { apply } = useTrackerActions()
  const [adding, setAdding] = useState(false)

  const handleAdd = async (title: string) =>
    (await apply({ kind: 'card.create', groupId: group.id, fields: { title } })).ok

  return (
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
  )
}
