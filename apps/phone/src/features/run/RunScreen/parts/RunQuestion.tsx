import { useState } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RunQuestionWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../RunScreen.module.scss'
import { Dock } from '../../../../shell/Dock/Dock'
import { OptionList } from '../../../../shell/OptionList/OptionList'
import { PathText } from '../../../../shell/PathText/PathText'
import { TooLongNote } from '../../../../shell/TooLongNote/TooLongNote'

/**
 * Вопрос головы сценария над полем, как вопрос хода в разговоре: варианты - списком, свои слова
 * заменяют выбор; без вариантов это разрешение - разрешить или отказать, со словами или без. Как
 * в окне прогона IDE. Урезанный (движком или дорогой до телефона) вслепую не одобряется:
 * разрешение - только отказать, вопрос с вариантами - решить за Mac.
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
  const [picked, setPicked] = useState('')
  const isPermission = question.options.length === 0
  const blind = question.truncated
  const answer = text.trim() || picked

  const handleAnswer = (allow: boolean, words: string) => {
    onAnswer(allow, words)
    setText('')
  }

  return (
    <Dock
      icon={MessageCircleQuestion}
      title={t('run.question.title')}
      description={question.tool || undefined}
      actions={
        isPermission ? (
          <>
            <Button
              size="touch"
              variant="danger"
              disabled={busy}
              onClick={() => handleAnswer(false, text.trim())}>
              {t('run.question.refuse')}
            </Button>
            {!blind && (
              <Button
                size="touch"
                variant="primary"
                disabled={busy}
                onClick={() => handleAnswer(true, text.trim())}>
                {t('run.question.allow')}
              </Button>
            )}
          </>
        ) : (
          <Button
            size="touch"
            variant="primary"
            disabled={busy || blind || !answer}
            onClick={() => handleAnswer(true, answer)}>
            {t('run.question.send')}
          </Button>
        )
      }>
      {blind && <TooLongNote />}
      <p className={styles.questionTitle}>
        <PathText text={question.title || question.tool} />
      </p>
      {isPermission && question.detail && (
        <pre className={styles.detail}>
          <PathText text={question.detail} />
        </pre>
      )}
      {!isPermission && !blind && (
        <OptionList
          label={question.title || question.tool}
          options={question.options.map((option) => ({ value: option, label: option }))}
          isSelected={(option) => option === picked}
          disabled={busy}
          onSelect={setPicked}
        />
      )}
      <TextField
        size="touch"
        label={t('run.question.words')}
        placeholder={t(
          isPermission ? 'run.question.wordsPlaceholder' : 'run.question.ownPlaceholder',
        )}
        value={text}
        onChange={setText}
      />
    </Dock>
  )
}
