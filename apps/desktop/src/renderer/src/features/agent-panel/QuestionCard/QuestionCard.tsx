import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import styles from './QuestionCard.module.scss'
import type { QuestionCardProps } from './QuestionCard.types'
import { clockTime, answerPairs } from './QuestionCard.utils'

/**
 * Ответ человека на вопрос модели, как в ACC: сам вопрос карточкой в ленте не стоит (он
 * над полем, пока открыт), а ответ встаёт строкой человека - вопрос приглушённо, под ним
 * выбранное. Так разговор из истории читается, как читался за столом.
 */
export const QuestionCard = memo(({ tool }: QuestionCardProps) => {
  const { t } = useTranslation()
  const pairs = answerPairs(tool)

  if (pairs.length === 0) return null

  return (
    <div className={styles.questionCard}>
      <div className={styles.head}>
        <span className={styles.who}>{t('agentPanel.feed.you')}</span>
        {tool.endedAt > 0 && <span className={styles.time}>{clockTime(tool.endedAt)}</span>}
      </div>
      {pairs.map(({ question, answer }) => (
        <div key={question} className={styles.pair}>
          <div className={styles.question}>{question}</div>
          <div className={styles.answer}>{answer}</div>
        </div>
      ))}
    </div>
  )
})

QuestionCard.displayName = 'QuestionCard'
