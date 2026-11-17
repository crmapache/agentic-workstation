import { useState } from 'react'
import { AlarmClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { DateField } from '@agentic-workstation/ui/DateField'
import { Modal } from '@agentic-workstation/ui/Modal'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'
import { TimeField } from '@agentic-workstation/ui/TimeField'

import { useInboxActions } from '../inbox.actions'
import {
  fullDayLabel,
  weekdayNames,
  monthYearLabel,
  weekdayDayLabel,
} from '../../../lib/dates.utils'
import styles from './ReminderModal.module.scss'
import type { ReminderModalProps } from './ReminderModal.types'
import { soonOf, todayOf, momentOf } from './ReminderModal.utils'

/**
 * Напоминание себе без ИИ: о чём, подробности, день и время. В свой срок оно придёт в
 * уведомления, как напоминание от ИИ, - звуком, карточкой в углу и баннером ОС.
 */
export const ReminderModal = ({ onClose }: ReminderModalProps) => {
  const { t } = useTranslation()
  const actions = useInboxActions()
  const [openedAt] = useState(() => Date.now())
  const [soon] = useState(() => soonOf(openedAt))
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [day, setDay] = useState(soon.day)
  const [at, setAt] = useState(soon.at)
  const today = todayOf(openedAt)

  const handleSave = async () => {
    if (await actions.remind({ title, body, deliverAt: momentOf(day, at) })) onClose()
  }

  return (
    <Modal
      open
      icon={AlarmClock}
      title={t('inbox.remind.title')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            {t('inbox.remind.cancel')}
          </Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => void handleSave()}>
            {t('inbox.remind.save')}
          </Button>
        </div>
      }>
      <div className={styles.body}>
        <TextField
          data-autofocus
          label={t('inbox.remind.what')}
          placeholder={t('inbox.remind.whatPlaceholder')}
          value={title}
          onChange={setTitle}
        />
        <TextArea
          label={t('inbox.remind.note')}
          placeholder={t('inbox.remind.notePlaceholder')}
          value={body}
          onChange={setBody}
        />
        <div className={styles.when}>
          <DateField
            label={t('inbox.remind.date')}
            valueLabel={weekdayDayLabel(day)}
            value={day}
            today={today}
            min={today}
            monthLabel={monthYearLabel}
            dayLabel={fullDayLabel}
            weekdayLabels={weekdayNames()}
            previousMonthLabel={t('inbox.dates.previousMonth')}
            nextMonthLabel={t('inbox.dates.nextMonth')}
            onChange={setDay}
          />
          <TimeField
            label={t('inbox.remind.at')}
            hourLabel={t('inbox.remind.hour')}
            minuteLabel={t('inbox.remind.minute')}
            value={at}
            onChange={setAt}
          />
        </div>
      </div>
    </Modal>
  )
}
