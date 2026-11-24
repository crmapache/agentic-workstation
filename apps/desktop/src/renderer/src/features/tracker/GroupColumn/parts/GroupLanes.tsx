import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../GroupColumn.module.scss'
import type { GroupLanesProps } from '../GroupColumn.types'
import { followUpLanes } from '../GroupColumn.utils'
import { useTrackerActions } from '../../tracker.actions'
import { CardTile } from '../../CardTile/CardTile'
import { QuickAdd } from '../../QuickAdd/QuickAdd'

/**
 * Тело группы: столбик задач с «Add task» внизу и справа столбики продолжений (первые
 * продолжения задач, вторые...). Рядов нет: столбики идут каждый своим ходом, как колонки
 * Todoist, и высокая карточка не оставляет пустоты рядом. «+» на последней карточке цепочки
 * открывает поле следующего продолжения в столбике за ней.
 */
export const GroupLanes = ({ group }: GroupLanesProps) => {
  const { t } = useTranslation()
  const { apply } = useTrackerActions()
  const [addingTask, setAddingTask] = useState(false)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const lanes = followUpLanes(group.tasks, addingFor)

  const handleAddTask = async (title: string) =>
    (await apply({ kind: 'card.create', groupId: group.id, fields: { title } })).ok
  const handleAddFollowUp = async (taskId: string, title: string) =>
    (await apply({ kind: 'card.create', groupId: group.id, followUpOf: taskId, fields: { title } }))
      .ok
  const handleCloseFollowUp = () => setAddingFor(null)

  return (
    <div className={styles.body} data-group-body="">
      <div className={styles.lane}>
        {group.tasks.map((task) => (
          <CardTile
            key={task.id}
            card={task}
            groupId={group.id}
            followUp={false}
            rootId={task.id}
            onAddFollowUp={task.followUps.length ? undefined : () => setAddingFor(task.id)}
          />
        ))}
        <div className={styles.end} data-group-end="">
          {addingTask ? (
            <QuickAdd
              placeholder={t('tracker.card.taskPlaceholder')}
              onAdd={handleAddTask}
              onClose={() => setAddingTask(false)}
            />
          ) : (
            <Button variant="dashed" size="sm" icon={Plus} onClick={() => setAddingTask(true)}>
              {t('tracker.group.addTask')}
            </Button>
          )}
        </div>
      </div>
      {lanes.map((lane, index) => (
        // Столбик - номер продолжения в цепочке: ключ по месту и есть его смысл.
        <div key={index} className={styles.lane}>
          {lane.map((slot) =>
            slot.kind === 'card' ? (
              <CardTile
                key={slot.card.id}
                card={slot.card}
                groupId={group.id}
                followUp
                rootId={slot.taskId}
                onAddFollowUp={slot.last ? () => setAddingFor(slot.taskId) : undefined}
              />
            ) : (
              <QuickAdd
                key={`add-${slot.taskId}`}
                placeholder={t('tracker.card.followUpPlaceholder')}
                onAdd={(title) => handleAddFollowUp(slot.taskId, title)}
                onClose={handleCloseFollowUp}
              />
            ),
          )}
        </div>
      ))}
    </div>
  )
}
