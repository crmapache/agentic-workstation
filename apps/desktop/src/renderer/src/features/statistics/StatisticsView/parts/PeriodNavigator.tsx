import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { DatePicker } from '@agentic-workstation/ui/DatePicker'
import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import styles from '../StatisticsView.module.scss'
import type { PeriodNavigatorProps } from '../StatisticsView.types'
import { periodLabelOf } from '../StatisticsView.utils'
import {
  startOfDay,
  hasEarlierOf,
  pickedLastDayOf,
  steppedLastDayOf,
} from '../../statistics-period.utils'
import { PERIOD_DAYS } from '../../statistics.constants'
import { useStatisticsStore } from '../../statistics.store'
import { fullDayLabel, weekdayNames, monthYearLabel } from '../../../../lib/dates.utils'

/**
 * Листание периода рядом с его выбором: стрелки - соседний период той же длины, дата -
 * календарь, где выбирают последний день периода (у 7 и 30 дней он подсвечивает весь
 * отрезок). Пока смотрят прошлое, «Today» возвращает к сегодняшнему. Назад - пока раньше
 * есть данные, вперёд - до сегодня. У всего времени листать некуда - навигатора нет.
 */
export const PeriodNavigator = ({ range, dataStart }: PeriodNavigatorProps) => {
  const { t } = useTranslation()
  const period = useStatisticsStore((state) => state.period)
  const setLastDay = useStatisticsStore((state) => state.setLastDay)
  const popover = usePopover()

  if (period === 'all') return null

  const isToday = range.lastDay === range.today
  const label = periodLabelOf(period, range, {
    today: t('statistics.navigator.today'),
    yesterday: t('statistics.navigator.yesterday'),
    range: (from, to) => t('statistics.navigator.range', { from, to }),
  })

  const handlePrevious = () => setLastDay(steppedLastDayOf(period, range, -1))
  const handleNext = () => setLastDay(steppedLastDayOf(period, range, 1))
  const handleToday = () => setLastDay(null)
  const handlePick = (day: number) => {
    setLastDay(pickedLastDayOf(day, range.today))
    popover.close()
  }

  return (
    <div className={styles.navigator}>
      <IconButton
        icon={ChevronLeft}
        label={t(`statistics.navigator.previous.${period}`)}
        size="sm"
        disabled={!hasEarlierOf(range, dataStart)}
        onClick={handlePrevious}
      />
      <DropdownButton
        {...popover.triggerProps}
        label={label}
        menuLabel={t('statistics.navigator.pick')}
        size="sm"
        chevron={false}
      />
      <IconButton
        icon={ChevronRight}
        label={t(`statistics.navigator.next.${period}`)}
        size="sm"
        disabled={isToday}
        onClick={handleNext}
      />
      {!isToday && (
        <Button variant="ghost" size="sm" onClick={handleToday}>
          {t('statistics.navigator.today')}
        </Button>
      )}
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <DatePicker
            value={range.lastDay}
            span={PERIOD_DAYS[period]}
            today={range.today}
            min={dataStart === null ? undefined : startOfDay(dataStart)}
            max={range.today}
            monthLabel={monthYearLabel}
            dayLabel={fullDayLabel}
            weekdayLabels={weekdayNames()}
            previousMonthLabel={t('statistics.navigator.previousMonth')}
            nextMonthLabel={t('statistics.navigator.nextMonth')}
            autoFocus
            onChange={handlePick}
          />
        )}
      </Popover>
    </div>
  )
}
