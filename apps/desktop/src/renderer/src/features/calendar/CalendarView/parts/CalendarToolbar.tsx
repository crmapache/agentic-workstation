import { PanelLeft, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { DatePicker } from '@agentic-workstation/ui/DatePicker'
import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import styles from '../CalendarView.module.scss'
import type { CalendarToolbarProps } from '../CalendarView.types'
import { periodLabel } from '../CalendarView.utils'
import { useCalendarStore } from '../../calendar.store'
import type { CalendarMode } from '../../calendar.types'
import { startOfDay, steppedAnchor, nextOverlapAfter } from '../../calendar.utils'
import { fullDayLabel, weekdayNames, monthYearLabel } from '../../../../lib/dates.utils'

/**
 * Листание периода (стрелки, дата календарём, «Today»), неделя или день и накладки периода с
 * переходом к следующей впереди.
 */
export const CalendarToolbar = ({ period, now, overlaps, upcoming }: CalendarToolbarProps) => {
  const { t } = useTranslation()
  const mode = useCalendarStore((store) => store.mode)
  const anchor = useCalendarStore((store) => store.anchor)
  const setMode = useCalendarStore((store) => store.setMode)
  const setAnchor = useCalendarStore((store) => store.setAnchor)
  const sourcesOpen = useCalendarStore((store) => store.sourcesOpen)
  const toggleSources = useCalendarStore((store) => store.toggleSources)
  const popover = usePopover()
  const today = startOfDay(now)
  const showsToday = period.from <= now && now < period.to
  const next = nextOverlapAfter(upcoming, period.to)
  const modes = (['week', 'day'] as const).map((id) => ({ id, label: t(`calendar.modes.${id}`) }))

  const handleStep = (step: -1 | 1) => setAnchor(steppedAnchor(mode, anchor ?? now, step))
  const handlePick = (day: number) => {
    setAnchor(day)
    popover.close()
  }
  const handleMode = (id: CalendarMode) => setMode(id)

  return (
    <div className={styles.toolbar}>
      <IconButton
        icon={PanelLeft}
        label={t(sourcesOpen ? 'calendar.sources.hide' : 'calendar.sources.showPanel')}
        size="sm"
        active={sourcesOpen}
        onClick={toggleSources}
      />
      <div className={styles.navigator}>
        <IconButton
          icon={ChevronLeft}
          label={t(`calendar.navigator.previous.${mode}`)}
          size="sm"
          onClick={() => handleStep(-1)}
        />
        <DropdownButton
          {...popover.triggerProps}
          label={periodLabel(mode, period)}
          menuLabel={t('calendar.navigator.pick')}
          size="sm"
          chevron={false}
        />
        <IconButton
          icon={ChevronRight}
          label={t(`calendar.navigator.next.${mode}`)}
          size="sm"
          onClick={() => handleStep(1)}
        />
        {!showsToday && (
          <Button variant="ghost" size="sm" onClick={() => setAnchor(null)}>
            {t('calendar.navigator.today')}
          </Button>
        )}
        <Popover {...popover.popoverProps}>
          {popover.isOpen && (
            <DatePicker
              value={anchor ?? today}
              today={today}
              monthLabel={monthYearLabel}
              dayLabel={fullDayLabel}
              weekdayLabels={weekdayNames()}
              previousMonthLabel={t('calendar.navigator.previousMonth')}
              nextMonthLabel={t('calendar.navigator.nextMonth')}
              autoFocus
              onChange={handlePick}
            />
          )}
        </Popover>
      </div>
      <Tabs label={t('calendar.modes.label')} items={modes} value={mode} onChange={handleMode} />
      <span className={styles.spacer} />
      <div className={styles.overlaps}>
        {overlaps > 0 && (
          <Badge tone="danger" variant="soft" icon={TriangleAlert}>
            {t('calendar.overlaps.inPeriod', { count: overlaps })}
          </Badge>
        )}
        {next !== null && (
          <Button variant="ghost" size="sm" onClick={() => setAnchor(startOfDay(next))}>
            {t('calendar.overlaps.next')}
          </Button>
        )}
      </div>
    </div>
  )
}
