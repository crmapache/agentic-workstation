import { clsx } from 'clsx'
import { Plus, CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'

import { CALENDAR_TICK_MS } from '../calendar.constants'
import { useMeetings, useCalendarViewed } from '../calendar.hooks'
import { useCalendarStore } from '../calendar.store'
import { periodOf } from '../calendar.utils'
import { SourceModal } from '../SourceModal/SourceModal'
import { SourcesPanel } from '../SourcesPanel/SourcesPanel'
import { WeekGrid } from '../WeekGrid/WeekGrid'
import { useNow } from '../../../lib/now.hooks'
import { useCalendar, useCalendarEvents } from '../../../state/calendar.queries'
import styles from './CalendarView.module.scss'
import { CalendarToolbar } from './parts/CalendarToolbar'
import { SyncButton } from './parts/SyncButton'

/**
 * Календарь звонков (ADR 0114) - вид середины окна, общий на IDE: звонки всех источников на
 * одной сетке, накладки видны сразу. Источники слева, неделя или день справа, синк в шапке.
 */
export const CalendarView = () => {
  const { t } = useTranslation()
  const { data: state } = useCalendar()
  const mode = useCalendarStore((store) => store.mode)
  const anchor = useCalendarStore((store) => store.anchor)
  const editing = useCalendarStore((store) => store.editing)
  const edit = useCalendarStore((store) => store.edit)
  const sourcesOpen = useCalendarStore((store) => store.sourcesOpen)
  const now = useNow(true, CALENDAR_TICK_MS)
  const period = periodOf(mode, anchor ?? now)
  const { data: events } = useCalendarEvents(period.from, period.to)
  const sources = state?.sources ?? []
  const { meetings, overlaps } = useMeetings(events ?? [], sources)

  useCalendarViewed()

  const addButton = (
    <Button icon={Plus} variant="secondary" onClick={() => edit(null)}>
      {t('calendar.actions.add')}
    </Button>
  )

  return (
    <div className={styles.view}>
      <PageHeader
        icon={CalendarDays}
        title={t('calendar.title')}
        help={
          <HelpButton
            label={t('calendar.help.label')}
            title={t('calendar.help.title')}
            text={t('calendar.help.text')}
            closeLabel={t('common.close')}
          />
        }
        actions={sources.length > 0 && <SyncButton sources={sources} />}
        toolbar={
          sources.length > 0 && (
            <CalendarToolbar
              period={period}
              now={now}
              overlaps={overlaps.length}
              upcoming={state?.nextOverlaps ?? []}
            />
          )
        }
      />
      {sources.length === 0 ? (
        <div className={styles.empty}>
          <EmptyState
            icon={CalendarDays}
            title={t('calendar.empty.title')}
            description={t('calendar.empty.note')}
            action={addButton}
          />
        </div>
      ) : (
        <div className={clsx(styles.body, !sourcesOpen && styles.wide)}>
          {sourcesOpen && <SourcesPanel state={state} />}
          <WeekGrid
            period={period}
            meetings={meetings}
            overlaps={overlaps}
            now={now}
            sources={sources}
          />
        </div>
      )}
      {editing !== undefined && <SourceModal sourceId={editing} />}
    </div>
  )
}
