import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { TimeField } from '@agentic-workstation/ui/TimeField'
import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import { WEEKDAYS, NOTE_TICK_MS } from '../QueueHoursModal.constants'
import { useHoursForm } from '../QueueHoursModal.hooks'
import styles from '../QueueHoursModal.module.scss'
import type { HoursFormProps } from '../QueueHoursModal.types'
import { useHoursWords } from '../../scenarios-queue-hours.hooks'
import { hoursNow } from '../../scenarios-queue-hours.utils'
import { weekdayNames } from '../../../../lib/dates.utils'
import { useNow } from '../../../../lib/now.hooks'

/**
 * Форма часов: дни недели, с и до, под ними - что будет сразу после Save (вне окна идущий
 * сценарий встанет на паузу) тем же счётом, что у главного процесса. В подвале - снять часы,
 * если они есть: очередь снова работает в любое время.
 */
export const HoursForm = ({ queue }: HoursFormProps) => {
  const { t } = useTranslation()
  const form = useHoursForm(queue)
  const words = useHoursWords()
  const now = useNow(true, NOTE_TICK_MS)
  const names = weekdayNames()
  const title = t('scenarios.queues.hours.form.title')
  const time = {
    hourLabel: t('scenarios.queues.hours.form.hour'),
    minuteLabel: t('scenarios.queues.hours.form.minute'),
  }

  return (
    <Modal
      open
      icon={Clock}
      title={title}
      description={queue.name}
      headerActions={
        <HelpButton
          label={t('scenarios.queues.hours.form.help.label')}
          title={title}
          text={t('scenarios.queues.hours.form.help.text')}
          closeLabel={t('common.close')}
        />
      }
      footer={
        <div className={styles.footer}>
          {form.isSet && (
            <Button variant="ghost" disabled={form.isSaving} onClick={form.remove}>
              {t('scenarios.queues.hours.form.anyTime')}
            </Button>
          )}
          <div className={styles.footerEnd}>
            <Button variant="ghost" onClick={form.close}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={!form.canSave} onClick={form.save}>
              {t('scenarios.queues.hours.form.save')}
            </Button>
          </div>
        </div>
      }
      closeLabel={t('common.close')}
      onClose={form.close}>
      <div className={styles.body}>
        <div className={styles.field}>
          <span className={styles.caption}>{t('scenarios.queues.hours.form.days')}</span>
          <div className={styles.days}>
            {WEEKDAYS.map((day) => (
              <ToggleChip
                key={day}
                label={names[day - 1] ?? ''}
                pressed={form.hours.days.includes(day)}
                onChange={form.toggleDay(day)}
              />
            ))}
          </div>
        </div>
        <div className={styles.row}>
          <TimeField
            {...time}
            label={t('scenarios.queues.hours.form.from')}
            value={form.hours.from}
            onChange={form.setFrom}
          />
          <TimeField
            {...time}
            label={t('scenarios.queues.hours.form.to')}
            value={form.hours.to}
            onChange={form.setTo}
          />
        </div>
        <span className={styles.note} role="status">
          {words.now(hoursNow(form.hours, now), now)}
        </span>
      </div>
    </Modal>
  )
}
