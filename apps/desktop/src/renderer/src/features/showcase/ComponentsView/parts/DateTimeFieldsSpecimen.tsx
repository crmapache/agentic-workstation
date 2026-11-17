import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DateField } from '@agentic-workstation/ui/DateField'
import { TimeField } from '@agentic-workstation/ui/TimeField'

import {
  dateSampleDay,
  TIME_SAMPLE_AT,
  dateSampleMonth,
  DATE_SAMPLE_TODAY,
  DATE_SAMPLE_WEEKDAYS,
} from '../ComponentsView.constants'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Образцы полей дня и времени формы: день с календарём во всплывающей панели, время часом и
 * минутами с подписью «когда это», и только минуты часа - как в окне задания по расписанию.
 */
export const DateTimeFieldsSpecimen = () => {
  const { t } = useTranslation('showcase')
  const [day, setDay] = useState(DATE_SAMPLE_TODAY)
  const [at, setAt] = useState(TIME_SAMPLE_AT)
  const [minute, setMinute] = useState(TIME_SAMPLE_AT % 60)
  const times = {
    label: t('samples.timeLabel'),
    hourLabel: t('samples.selectHour'),
    minuteLabel: t('samples.selectMinute'),
  }

  return (
    <Specimen label={t('specimens.dateTimeFields')} layout="column">
      <DateField
        label={t('samples.dateLabel')}
        valueLabel={dateSampleDay(day)}
        value={day}
        today={DATE_SAMPLE_TODAY}
        min={DATE_SAMPLE_TODAY}
        monthLabel={dateSampleMonth}
        dayLabel={dateSampleDay}
        weekdayLabels={DATE_SAMPLE_WEEKDAYS}
        previousMonthLabel={t('samples.previousMonth')}
        nextMonthLabel={t('samples.nextMonth')}
        onChange={setDay}
      />
      <TimeField {...times} value={at} note={t('samples.timeNote')} onChange={setAt} />
      <TimeField {...times} value={minute} minutesOnly minuteStep={15} onChange={setMinute} />
    </Specimen>
  )
}
