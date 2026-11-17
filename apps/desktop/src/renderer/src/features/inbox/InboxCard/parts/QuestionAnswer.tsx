import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'
import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import styles from '../InboxCard.module.scss'
import type { ItemPartProps } from '../InboxCard.types'
import { useInboxActions } from '../../inbox.actions'
import { answersOf, togglePick, answersAtOnce } from '../../inbox.utils'

/**
 * Ответ на вопросы AskUserQuestion прогона: варианты кнопками. Один вопрос с одним ответом
 * уходит нажатием варианта, иначе - выбранное кнопкой «Send answer». Своё слово вместо
 * вариантов - полем под вопросом: на него модель и рассчитывает.
 */
export const QuestionAnswer = ({ item }: ItemPartProps) => {
  const { t } = useTranslation()
  const actions = useInboxActions()
  const [picks, setPicks] = useState<Record<string, string[]>>({})
  const [own, setOwn] = useState<Record<string, string>>({})
  const answer = item.actions.find((one) => one.kind === 'answer')
  const atOnce = answersAtOnce(item.questions)
  const ready = answersOf(item.questions, picks, own)

  const send = (answers: Record<string, string> | null) => {
    if (answer && answers) void actions.act(item, answer, '', answers)
  }

  const handlePick = (question: string, label: string, multi: boolean) => () => {
    if (atOnce) return send({ [question]: label })

    setPicks((current) => ({
      ...current,
      [question]: togglePick(current[question] ?? [], label, multi),
    }))
  }

  const handleOwn = (question: string) => (value: string) =>
    setOwn((current) => ({ ...current, [question]: value }))

  return (
    <div className={styles.questions}>
      {item.questions.map(({ question, header, options, multiSelect }) => (
        <div key={question} className={styles.question}>
          <div className={styles.questionText}>
            {header && <Badge variant="soft">{header}</Badge>}
            {question}
          </div>
          <div className={styles.options}>
            {options.map(({ label }) =>
              atOnce ? (
                <Button
                  key={label}
                  size="sm"
                  variant="secondary"
                  onClick={handlePick(question, label, false)}>
                  {label}
                </Button>
              ) : (
                <ToggleChip
                  key={label}
                  label={label}
                  pressed={picks[question]?.includes(label) ?? false}
                  onChange={handlePick(question, label, multiSelect)}
                />
              ),
            )}
          </div>
          <TextField
            hideLabel
            label={t('inbox.question.other')}
            placeholder={t('inbox.question.otherPlaceholder')}
            value={own[question] ?? ''}
            onChange={handleOwn(question)}
          />
        </div>
      ))}
      {answer && (
        <div className={styles.buttons}>
          <Button size="sm" variant="primary" disabled={!ready} onClick={() => send(ready)}>
            {t('inbox.actions.answer')}
          </Button>
        </div>
      )}
    </div>
  )
}
