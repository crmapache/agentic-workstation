import { useState } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../PendingCard.module.scss'
import type { PendingOf, PendingCardProps } from '../PendingCard.types'
import { pickOption, allAnswered, questionAnswers } from '../PendingCard.utils'
import { Dock } from '../../../../shell/Dock/Dock'
import { OptionList } from '../../../../shell/OptionList/OptionList'
import { TooLongNote } from '../../../../shell/TooLongNote/TooLongNote'

/**
 * Вопрос модели с вариантами: один или несколько, или свой ответ словами. Урезанный по дороге -
 * без ответа с телефона: варианты могли потерять то, что в них важно, - но закрыть его, не
 * отвечая, можно и тогда.
 */
export const QuestionCard = ({
  pending,
  pendingCount,
  busy,
  onDecide,
  onDismiss,
}: PendingCardProps & { pending: PendingOf<'question'> }) => {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<Record<number, string[]>>({})
  const [own, setOwn] = useState<Record<number, string>>({})
  const answers = questionAnswers(pending.questions, picked, own)

  const handlePick = (index: number, multi: boolean) => (label: string) =>
    setPicked({ ...picked, [index]: pickOption(picked[index] ?? [], label, multi) })

  const handleAnswer = () => onDecide(pending.requestId, { kind: 'question', answers })

  return (
    <Dock
      icon={MessageCircleQuestion}
      title={t('pending.question.title')}
      description={pendingCount > 1 ? t('pending.more', { count: pendingCount - 1 }) : undefined}
      actions={
        <>
          <Button
            size="touch"
            variant="ghost"
            disabled={busy}
            onClick={() => onDismiss(pending.requestId)}>
            {t('pending.question.dismiss')}
          </Button>
          <Button
            size="touch"
            variant="primary"
            disabled={busy || pending.truncated || !allAnswered(answers)}
            onClick={handleAnswer}>
            {t('pending.question.send')}
          </Button>
        </>
      }>
      {pending.truncated && <TooLongNote />}
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
            size="touch"
            label={t('pending.question.own')}
            placeholder={t('pending.question.ownPlaceholder')}
            value={own[index] ?? ''}
            onChange={(value) => setOwn({ ...own, [index]: value })}
          />
        </div>
      ))}
    </Dock>
  )
}
