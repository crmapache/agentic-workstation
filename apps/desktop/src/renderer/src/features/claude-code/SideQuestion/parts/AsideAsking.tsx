import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../SideQuestion.module.scss'
import type { AsideAskingProps } from '../SideQuestion.types'
import { askingLine } from '../SideQuestion.utils'
import { TICK_MS } from '../../claude.constants'
import { useNow } from '../../clock.hooks'

/** Ответ ещё идёт: сколько уже думает (или повтор API, когда API отказывает) и Cancel. */
export const AsideAsking = ({ exchange, onCancel }: AsideAskingProps) => {
  const { t } = useTranslation()
  const now = useNow(true, TICK_MS)

  return (
    <div className={styles.asking} role="status">
      <span className={clsx(styles.pulse, exchange.retry && styles.pulseWarning)} aria-hidden />
      <span className={styles.askingText}>{askingLine(exchange, now, t)}</span>
      <Button size="sm" variant="ghost" onClick={() => onCancel(exchange.id)}>
        {t('claudeCode.aside.cancel')}
      </Button>
    </div>
  )
}
