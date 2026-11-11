import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../SideQuestion.module.scss'
import type { AsideUnansweredProps } from '../SideQuestion.types'
import { unansweredText } from '../SideQuestion.utils'

/**
 * Кончился без ответа модели: почему - строкой, слова CLI (его заглушка или ошибка, как
 * он их написал) - под ней, и тот же вопрос заново на его месте.
 */
export const AsideUnanswered = ({ exchange, onAskAgain }: AsideUnansweredProps) => {
  const { t } = useTranslation()
  const { headline, detail } = unansweredText(exchange, t)

  return (
    <div
      className={clsx(styles.unanswered, exchange.state !== 'cancelled' && styles.unansweredBad)}>
      <div className={styles.unansweredText}>
        <span>{headline}</span>
        {detail && <span className={styles.detail}>{detail}</span>}
      </div>
      <Button size="sm" variant="ghost" onClick={() => onAskAgain(exchange)}>
        {t('claudeCode.aside.askAgain')}
      </Button>
    </div>
  )
}
