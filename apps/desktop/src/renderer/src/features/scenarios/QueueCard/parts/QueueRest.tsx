import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { REST_TICK_MS } from '../QueueCard.constants'
import styles from '../QueueCard.module.scss'
import type { QueueRestProps } from '../QueueCard.types'
import { useHoursWords } from '../../scenarios-queue-hours.hooks'
import { useScenariosStore } from '../../scenarios.store'
import { useNow } from '../../../../lib/now.hooks'

/**
 * Очередь спит вне рабочих часов (ADR 0074): что стоит и когда пойдёт само. Пустить её раньше -
 * снять или сдвинуть часы («Change hours»); идущий на паузе можно и просто продолжить кнопкой
 * Resume ниже - часы его до следующего конца окна не тронут.
 */
export const QueueRest = ({ queueId, why }: QueueRestProps) => {
  const { t } = useTranslation()
  const words = useHoursWords()
  const open = useScenariosStore((state) => state.open)
  // «Today 10:00» становится «Tomorrow…» в полночь - строка сверяется с часами раз в минуту.
  const now = useNow(true, REST_TICK_MS)

  const handleHours = () => open({ kind: 'hours', queueId })

  return (
    <div role="status" className={styles.hold}>
      <span className={styles.holdText}>{words.rest(why, now)}</span>
      <span className={styles.holdActions}>
        <Button size="sm" variant="ghost" onClick={handleHours}>
          {t('scenarios.queues.hours.change')}
        </Button>
      </span>
    </div>
  )
}
