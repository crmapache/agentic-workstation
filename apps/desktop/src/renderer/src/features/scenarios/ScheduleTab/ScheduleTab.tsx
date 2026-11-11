import { Plus, CircleAlert, CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Section } from '@agentic-workstation/ui/Section'

import { useNow } from '../scenarios-clock.hooks'
import { dayLabel } from '../scenarios-forms.utils'
import { timetableOf } from '../scenarios-hours.utils'
import { ScenarioConfirm } from '../ScenarioConfirm/ScenarioConfirm'
import type { ScenariosTabProps } from '../ScenariosView/ScenariosView.types'
import { useScenarioShelves } from '../../../state/scenarios.queries'
import { COUNTDOWN_TICK_MS } from './ScheduleTab.constants'
import { useScheduleActions } from './ScheduleTab.hooks'
import styles from './ScheduleTab.module.scss'
import { TimetableDay } from './parts/TimetableDay'

/**
 * Вкладка Schedule (ScheduleBand в ACC) - таймплан, а не список: пропущенные разовые часы
 * сверху (иначе прошедший при закрытой IDE час исчез бы бесследно), дальше дни заголовками и
 * строка на договорённость по ближайшему сроку. Нечитаемый файл - не пустое расписание.
 */
export const ScheduleTab = ({ project }: ScenariosTabProps) => {
  const { t } = useTranslation()
  const view = useScenarioShelves(project.id).data
  const hours = useScheduleActions(project)
  // Жёлоб говорит, сколько ждать, - и стареет, как часы.
  const now = useNow((view?.schedules.length ?? 0) > 0, COUNTDOWN_TICK_MS)

  if (view?.schedulesUnread)
    return (
      <EmptyState
        icon={CircleAlert}
        title={t('scenarios.schedule.unreadTitle')}
        description={t('scenarios.schedule.unreadNote')}
      />
    )

  const table = timetableOf(view?.schedules ?? [], view?.scenarios ?? [], now)
  const addButton = (
    <Button size="sm" variant="ghost" icon={Plus} onClick={hours.add}>
      {t('scenarios.schedule.add')}
    </Button>
  )
  const rowActions = { onEdit: hours.edit, onRemove: hours.remove, onRunNow: hours.runNow }

  return (
    <>
      <Section
        title={t('scenarios.schedule.title')}
        count={table.count}
        help={
          <HelpButton
            label={t('scenarios.schedule.help.label')}
            title={t('scenarios.schedule.title')}
            text={t('scenarios.schedule.help.text')}
            closeLabel={t('common.close')}
          />
        }
        actions={addButton}>
        {table.count === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={t('scenarios.schedule.emptyTitle')}
            description={t('scenarios.schedule.emptyNote')}
          />
        ) : (
          <div className={styles.days}>
            {table.missed.length > 0 && (
              <TimetableDay
                title={t('scenarios.schedule.missedGroup')}
                rows={table.missed}
                now={now}
                {...rowActions}
              />
            )}
            {table.days.map((day) => (
              <TimetableDay
                key={day.key}
                title={
                  day.awayInDays === 0
                    ? t('scenarios.schedule.today')
                    : day.awayInDays === 1
                      ? t('scenarios.schedule.tomorrow')
                      : dayLabel(day.at)
                }
                note={day.awayInDays <= 1 ? dayLabel(day.at) : undefined}
                rows={day.rows}
                now={now}
                {...rowActions}
              />
            ))}
          </div>
        )}
      </Section>
      <ScenarioConfirm
        open={hours.doomed !== null}
        title={t('scenarios.schedule.confirmDelete.title')}
        subject={hours.doomed?.scenario?.name ?? t('scenarios.schedule.orphan')}
        note={t('scenarios.schedule.confirmDelete.note')}
        submit={t('scenarios.schedule.confirmDelete.submit')}
        onSubmit={hours.confirmRemove}
        onClose={hours.cancelRemove}
      />
    </>
  )
}
