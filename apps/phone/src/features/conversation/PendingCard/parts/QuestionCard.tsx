import { useState } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../PendingCard.module.scss'
import type { PendingOf, PendingCardProps } from '../PendingCard.types'
import { allAnswered, questionAnswers } from '../PendingCard.utils'
import { OptionList } from '../../../../shell/OptionList/OptionList'
import { TooLongNote } from '../../../../shell/TooLongNote/TooLongNote'

/**
 * Вопрос модели с вариантами: один или несколько, или свой ответ словами. Урезанный по дороге -
 * без ответа с телефона: варианты могли потерять то, что в них важно.
 */
export const QuestionCard = ({
  pending,
  pendingCount,
  busy,
  onDecide,
}: PendingCardProps & { pending: PendingOf<'question'> }) => {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<Record<number, string[]>>({})
  const [own, setOwn] = useState<Record<number, string>>({})
  const answers = questionAnswers(pending.questions, picked, own)

  const handlePick = (index: number, multi: boolean) => (label: string) => {
    const current = picked[index] ?? []
    const next = multi
      ? current.includes(label)
        ? current.filter((one) => one !== label)
        : [...current, label]
      : [label]

    setPicked({ ...picked, [index]: next })
  }

  return (
    <Card
      tone="accent"
      icon={MessageCircleQuestion}
      title={t('pending.question.title')}
      description={pendingCount > 1 ? t('pending.more', { count: pendingCount - 1 }) : undefined}>
      <div className={styles.body}>
        {pending.questions.map((question, index) => (
          <div key={index} className={styles.question}>
            {question.header && <span className={styles.header}>{question.header}</span>}
            <p className={styles.lead}>{question.question}</p>
            <OptionList
              label={question.question}
              shape={question.multiSelect ? 'square' : 'circle'}
              options={question.options.map((option) => ({
                value: option.label,
                label: option.label,
                description: option.description,
              }))}
              isSelected={(label) => (picked[index] ?? []).includes(label)}
              onSelect={handlePick(index, question.multiSelect)}
            />
            <TextField
              label={t('pending.question.own')}
              placeholder={t('pending.question.ownPlaceholder')}
              value={own[index] ?? ''}
              onChange={(value) => setOwn({ ...own, [index]: value })}
            />
          </div>
        ))}
        {pending.truncated && <TooLongNote />}
        <div className={styles.actions}>
          <Button
            size="touch"
            variant="primary"
            disabled={busy || pending.truncated || !allAnswered(answers)}
            onClick={() => onDecide(pending.requestId, { kind: 'question', answers })}>
            {t('pending.question.send')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
