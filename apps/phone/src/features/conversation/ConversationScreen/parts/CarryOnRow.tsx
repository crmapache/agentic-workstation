import { Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { CarryOnWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ConversationScreen.module.scss'
import { clockText } from '../../../../lib/time.utils'

/**
 * Панель IDE сама продолжит разговор после лимита - когда (по часам телефона) и «не
 * продолжать». Срок угадан (лимит не сказал, когда сбросится) - «около».
 */
export const CarryOnRow = ({
  carryOn,
  offset,
  busy,
  onCancel,
}: {
  carryOn: CarryOnWire
  /** Насколько часы IDE впереди часов телефона. */
  offset: number
  busy: boolean
  onCancel: () => void
}) => {
  const { t } = useTranslation()
  const time = clockText(carryOn.until - offset)

  return (
    <div className={styles.carryOn}>
      <Hourglass className={styles.carryOnIcon} aria-hidden />
      <span className={styles.carryOnText}>
        {t(carryOn.guess ? 'conversation.carryOn.guessed' : 'conversation.carryOn.planned', {
          time,
        })}
      </span>
      <Button size="touch" variant="ghost" disabled={busy} onClick={onCancel}>
        {t('conversation.carryOn.cancel')}
      </Button>
    </div>
  )
}
