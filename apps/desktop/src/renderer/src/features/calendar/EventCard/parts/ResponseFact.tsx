import { useTranslation } from 'react-i18next'

import { SEPARATOR, RESPONSE_ICONS } from '../EventCard.constants'
import styles from '../EventCard.module.scss'
import type { EventFactProps } from '../EventCard.types'
import { FactRow } from './FactRow'

/**
 * Мой ответ и состояние встречи одной строкой: «Accepted · Tentative event», состояние -
 * цветом предупреждения. Ничего не известно и встреча обычная - строки нет.
 */
export const ResponseFact = ({ event }: EventFactProps) => {
  const { t } = useTranslation()
  const response = event.response === 'unknown' ? '' : t(`calendar.responses.${event.response}`)
  const status = [
    event.status === 'confirmed' ? '' : t(`calendar.statuses.${event.status}`),
    event.busy === 'free' ? t('calendar.event.shownFree') : '',
  ]
    .filter(Boolean)
    .join(SEPARATOR)

  if (!response && !status) return null

  return (
    <FactRow icon={RESPONSE_ICONS[event.response]} label={t('calendar.event.response')}>
      {response && <span>{response}</span>}
      {response && status && <span className={styles.subtle}>{SEPARATOR}</span>}
      {status && <span className={styles.warn}>{status}</span>}
    </FactRow>
  )
}
