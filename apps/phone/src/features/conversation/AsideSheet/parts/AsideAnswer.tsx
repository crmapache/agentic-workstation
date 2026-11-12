import { useTranslation } from 'react-i18next'

import type { AsideAnswerWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

import styles from '../AsideSheet.module.scss'
import { Markdown } from '../../../../shell/Markdown/Markdown'

/**
 * Чем кончился вопрос сбоку: ответ разметкой (урезанный - с пометкой, целиком он в IDE), пустой
 * ответ, отмена или почему не вышло - словами CLI, если он их сказал.
 */
export const AsideAnswer = ({ answer }: { answer: AsideAnswerWire }) => {
  const { t } = useTranslation()

  switch (answer.state) {
    case 'answered':
      return (
        <>
          <Markdown text={answer.text} />
          {answer.notice && <p className={styles.muted}>{answer.notice}</p>}
          {answer.truncated && <p className={styles.muted}>{t('aside.truncated')}</p>}
        </>
      )
    case 'empty':
      return <p className={styles.muted}>{answer.text || t('aside.empty')}</p>
    case 'cancelled':
      return <p className={styles.muted}>{t('aside.cancelled')}</p>
    case 'failed':
      return (
        <p className={styles.error}>
          {[t(`aside.failed.${answer.failure ?? 'other'}`), answer.message]
            .filter(Boolean)
            .join(': ')}
        </p>
      )
  }
}
