import { useRef } from 'react'
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
import { Sidebar } from '../Sidebar/Sidebar'
import { SourceModal } from '../SourceModal/SourceModal'
import { useNow } from '../../../lib/now.hooks'
import { useCalendar, useCalendarEvents } from '../../../state/calendar.queries'
import { useNarrowCalendar } from './CalendarView.hooks'
import styles from './CalendarView.module.scss'
import { sidebarStyle } from './CalendarView.utils'
import { CalendarBody } from './parts/CalendarBody'
import { CalendarToolbar } from './parts/CalendarToolbar'
import { SyncButton } from './parts/SyncButton'

/**
 * Календарь звонков (ADR 0114, 0116) - вид середины окна, общий на IDE: звонки всех источников
 * на одной сетке, накладки видны сразу. Слева во всю высоту - панель источников и накладок (её
 * тянут за край), справа - шапка с синком и листанием и неделя, день или месяц. Сетка не
 * сжимается уже своей наименьшей ширины: в узком виде панель уходит сама и открывается поверх
 * сетки, а уже и без неё сетка прокручивается вбок.
 */
export const CalendarView = () => {
  const { t } = useTranslation()
  const { data: state } = useCalendar()
  const mode = useCalendarStore((store) => store.mode)
  const anchor = useCalendarStore((store) => store.anchor)
  const editing = useCalendarStore((store) => store.editing)
  const edit = useCalendarStore((store) => store.edit)
  const sourcesOpen = useCalendarStore((store) => store.sourcesOpen)
  const sidebarWidth = useCalendarStore((store) => store.sidebarWidth)
  const narrow = useCalendarStore((store) => store.narrow)
  const peek = useCalendarStore((store) => store.peek)
  const closePeek = useCalendarStore((store) => store.closePeek)
  const view = useRef<HTMLDivElement>(null)
  const now = useNow(true, CALENDAR_TICK_MS)
  const period = periodOf(mode, anchor ?? now)
  const { data: events } = useCalendarEvents(period.from, period.to)
  const sources = state?.sources ?? []
  const seen = state?.seenOverlaps ?? []
  const { meetings, overlaps, active } = useMeetings(events ?? [], sources, seen)
  const hasSources = sources.length > 0
  const docked = hasSources && sourcesOpen && !narrow
  const floating = hasSources && narrow && peek

  useCalendarViewed()
  useNarrowCalendar(view, sidebarWidth)

  return (
    <div
      ref={view}
      className={clsx(styles.view, docked && styles.withSidebar)}
      // eslint-disable-next-line no-restricted-syntax -- ширину панели тянут ручкой на лету
      style={sidebarStyle(sidebarWidth)}>
      {(docked || floating) && state && <Sidebar state={state} floating={floating} />}
      {/* Панель поверх сетки закрывает и свою кнопку: её убирает нажатие по календарю рядом. */}
      <div className={styles.main} onPointerDown={floating ? closePeek : undefined}>
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
          actions={hasSources && <SyncButton sources={sources} />}
          toolbar={
            hasSources && (
              <CalendarToolbar
                period={period}
                now={now}
                overlaps={active.length}
                upcoming={state?.nextOverlaps ?? []}
              />
            )
          }
        />
        {hasSources && state ? (
          <CalendarBody
            period={period}
            meetings={meetings}
            overlaps={overlaps}
            active={active}
            state={state}
            now={now}
          />
        ) : (
          <div className={styles.empty}>
            <EmptyState
              icon={CalendarDays}
              title={t('calendar.empty.title')}
              description={t('calendar.empty.note')}
              action={
                <Button icon={Plus} variant="secondary" onClick={() => edit(null)}>
                  {t('calendar.actions.add')}
                </Button>
              }
            />
          </div>
        )}
      </div>
      {editing !== undefined && <SourceModal sourceId={editing} />}
    </div>
  )
}
