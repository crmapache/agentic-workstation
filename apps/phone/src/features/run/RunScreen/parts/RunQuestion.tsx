import { useState } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RunQuestionWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../RunScreen.module.scss'

/**
 * Вопрос головы сценария: варианты - кнопками, что предложили, то и нажимают; без вариантов это
 * разрешение - разрешить или отказать, со словами или без. Как в окне прогона IDE.
 */
export const RunQuestion = ({
  question,
  busy,
  onAnswer,
}: {
  question: RunQuestionWire
  busy: boolean
  onAnswer: (allow: boolean, text: string) => void
}) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const isPermission = question.options.length === 0

  const answer = (allow: boolean, words: string) => {
    onAnswer(allow, words)
    setText('')
  }

  return (
    <Card
      tone="accent"
      icon={MessageCircleQuestion}
      title={t('run.question.title')}
      description={question.tool || undefined}>
      <div className={styles.question}>
        <p className={styles.questionTitle}>{question.title || question.tool}</p>
        {isPermission && question.detail && <pre className={styles.detail}>{question.detail}</pre>}
        {!isPermission && (
          <div className={styles.options}>
            {question.options.map((option) => (
              <Button
                key={option}
                size="touch"
                disabled={busy}
                onClick={() => answer(true, option)}>
                {option}
              </Button>
            ))}
          </div>
        )}
        <TextField
          label={t('run.question.words')}
          placeholder={t('run.question.wordsPlaceholder')}
          value={text}
          onChange={setText}
        />
        <div className={styles.actions}>
          {isPermission ? (
            <>
              <Button
                size="touch"
                variant="danger"
                disabled={busy}
                onClick={() => answer(false, text.trim())}>
                {t('run.question.refuse')}
              </Button>
              <Button
                size="touch"
                variant="primary"
                disabled={busy}
                onClick={() => answer(true, text.trim())}>
                {t('run.question.allow')}
              </Button>
            </>
          ) : (
            <Button
              size="touch"
              variant="primary"
              disabled={busy || !text.trim()}
              onClick={() => answer(true, text.trim())}>
              {t('run.question.send')}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
