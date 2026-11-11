import { Copy, Check, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../SideQuestion.module.scss'
import type { AsideExchangeProps } from '../SideQuestion.types'
import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../../claude.constants'
import { useCopy } from '../../clipboard.hooks'
import { Markdown } from '../../Markdown/Markdown'
import { AsideAsking } from './AsideAsking'
import { AsideUnanswered } from './AsideUnanswered'

/**
 * Один вопрос сбоку: вопрос строкой с «›», ответ разметкой (копируется целиком), под ним
 * слова CLI о модели, которая ответила вместо отказавшейся; ждущий - часы и Cancel,
 * кончившийся без ответа - почему и Ask again.
 */
export const AsideExchangeView = ({ exchange, onCancel, onAskAgain }: AsideExchangeProps) => {
  const { t } = useTranslation()
  const { isCopied, copy } = useCopy()
  const answer = exchange.state === 'answered' && exchange.text ? exchange.text : null

  return (
    <div className={styles.exchange}>
      <div className={styles.question}>
        <ChevronRight
          className={styles.mark}
          size={ROW_ICON_SIZE}
          strokeWidth={ROW_ICON_STROKE}
          aria-hidden
        />
        <span className={styles.questionText}>{exchange.question}</span>
        {answer && (
          <IconButton
            icon={isCopied ? Check : Copy}
            size="sm"
            label={isCopied ? t('claudeCode.aside.copied') : t('claudeCode.aside.copy')}
            onClick={() => copy(answer)}
          />
        )}
      </div>
      {exchange.state === 'asking' && <AsideAsking exchange={exchange} onCancel={onCancel} />}
      {answer && (
        <div className={styles.answer}>
          <Markdown text={answer} />
          {exchange.notice && <p className={styles.notice}>{exchange.notice}</p>}
        </div>
      )}
      {exchange.state !== 'asking' && !answer && (
        <AsideUnanswered exchange={exchange} onAskAgain={onAskAgain} />
      )}
    </div>
  )
}
