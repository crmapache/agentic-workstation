import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ShelvesWire } from '@agentic-workstation/remote-protocol/scenario-wire-types'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Section } from '@agentic-workstation/ui/Section'

import type { useScenariosScreen } from '../ScenariosScreen.hooks'
import styles from '../ScenariosScreen.module.scss'
import { scheduledName } from '../ScenariosScreen.utils'
import { useNow } from '../../../../lib/now.hooks'
import { scheduleText } from '../../../../lib/schedule.utils'
import { momentText } from '../../../../lib/time.utils'
import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'

/**
 * Отложенные запуски проекта: сценарий, ритм и час (по часам Mac), ближайший срок или
 * пропущенный. Убрать - с «точно?»; поставить новый - со страницы сценария. Файл расписания не
 * прочитался - это не «расписаний нет», и так и сказано.
 */
export const ScheduleSection = ({
  shelves,
  screen,
}: {
  shelves: ShelvesWire
  screen: ReturnType<typeof useScenariosScreen>
}) => {
  const { t } = useTranslation()
  const now = useNow(60_000)
  const [removing, setRemoving] = useState<string | null>(null)
  const schedules = shelves.schedules ?? []

  const whenOf = (at: number) => momentText(at - screen.offset, now)

  return (
    <Section
      size="sm"
      title={t('scenarios.schedule')}
      count={schedules.length}
      description={
        shelves.schedulesUnread
          ? t('scenarios.schedulesUnread')
          : schedules.length === 0
            ? t('scenarios.noSchedules')
            : undefined
      }>
      {schedules.length > 0 && (
        <ListGroup label={t('scenarios.schedule')}>
          {schedules.map((schedule) => (
            <ListRow
              key={schedule.id}
              title={scheduledName(shelves, schedule) ?? t('scenarios.orphan')}
              description={[
                scheduleText(t, schedule),
                schedule.missedAt > 0
                  ? t('scenarios.missed', { when: whenOf(schedule.missedAt) })
                  : schedule.nextAt > 0 && t('scenarios.next', { when: whenOf(schedule.nextAt) }),
              ]
                .filter(Boolean)
                .join(' · ')}
              aside={
                <IconButton
                  icon={Trash2}
                  size="touch"
                  label={t('scenarios.unschedule')}
                  disabled={screen.busy}
                  onClick={() => setRemoving(schedule.id)}
                />
              }
            />
          ))}
        </ListGroup>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={t('scenarios.unscheduleConfirm')}
        text={t('scenarios.unscheduleText')}
        confirmLabel={t('scenarios.unschedule')}
        onConfirm={() => removing && screen.handleUnschedule(removing)}
        onClose={() => setRemoving(null)}
      />
      {shelves.schedulesUnread && <p className={styles.note}>{t('scenarios.unreadNote')}</p>}
    </Section>
  )
}
