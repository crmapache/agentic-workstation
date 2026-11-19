import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDuration } from '../panel.utils'
import { ChangesList } from '../ChangesList/ChangesList'
import { RESULT_KEYS } from './TurnSummary.constants'
import styles from './TurnSummary.module.scss'
import type { TurnSummaryProps } from './TurnSummary.types'
import { turnEnd } from './TurnSummary.utils'

/**
 * Конец хода, как в ACC: над итогом - файлы, которые поменял ход, под ними тусклая
 * подпись «Worked 3m 12s» (время всего запроса без пауз на вопросы), «Stopped by you ·
 * 5s» или «Stopped to switch account» - ход прервала панель, переводя разговор на другой
 * аккаунт. Цены и значков нет: подпись - чтобы знать, сколько это шло, а не событие.
 */
export const TurnSummary = memo(({ item }: TurnSummaryProps) => {
  const { t } = useTranslation()
  const time = item.durationMs > 0 ? formatDuration(item.durationMs) : ''
  const label = time
    ? t(RESULT_KEYS[turnEnd(item)].timed, { time })
    : t(RESULT_KEYS[turnEnd(item)].bare)

  return (
    <>
      {item.changes.length > 0 && <ChangesList turn={item} />}
      <div className={styles.turnSummary}>{label}</div>
    </>
  )
})

TurnSummary.displayName = 'TurnSummary'
