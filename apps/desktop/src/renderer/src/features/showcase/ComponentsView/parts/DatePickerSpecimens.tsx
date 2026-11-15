import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@agentic-workstation/ui/DatePicker'

import {
  dateSampleDay,
  DATE_SAMPLE_MIN,
  dateSampleMonth,
  DATE_SAMPLE_TODAY,
  DATE_SAMPLE_WEEKDAYS,
} from '../ComponentsView.constants'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Образцы календаря выбора дня: один день и неделя, которая кончается выбранным днём. Позже
 * «сегодня» и раньше начала данных выбрать нельзя; стрелки клавиатуры ходят по дням.
 */
export const DatePickerSpecimens = () => {
  const { t } = useTranslation('showcase')
  const [day, setDay] = useState(DATE_SAMPLE_TODAY)
  const [weekEnd, setWeekEnd] = useState(DATE_SAMPLE_TODAY)
  const shared = {
    today: DATE_SAMPLE_TODAY,
    min: DATE_SAMPLE_MIN,
    max: DATE_SAMPLE_TODAY,
    monthLabel: dateSampleMonth,
    dayLabel: dateSampleDay,
    weekdayLabels: DATE_SAMPLE_WEEKDAYS,
    previousMonthLabel: t('samples.previousMonth'),
    nextMonthLabel: t('samples.nextMonth'),
  }

  return (
    <>
      <Specimen label={t('specimens.datePicker')} layout="column">
        <DatePicker {...shared} value={day} onChange={setDay} />
      </Specimen>
      <Specimen label={t('specimens.datePickerSpan')} layout="column">
        <DatePicker {...shared} value={weekEnd} span={7} onChange={setWeekEnd} />
      </Specimen>
    </>
  )
}
