import type { FormEvent } from 'react'
import { useState } from 'react'
import { ScrollText, MessageCircleQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { CodeSnippet } from '@agentic-workstation/ui/CodeSnippet'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../RunModal.module.scss'
import type { RunQuestionCardProps } from '../RunModal.types'
import { detailText } from '../../scenarios-run.utils'
import { useScenarioActions } from '../../scenarios.actions'

/**
 * Вопрос, на котором прогон стоит, - наверху, где начинают читать. Варианты - кнопками: что
 * предложили, то и нажимают. Аргументы вызова - только у разрешения (у вопроса с вариантами в
 * них то же, что уже стоит словами), и Refuse - только у него: «нет» на вопрос с вариантами
 * дошло бы до карточки как «никто не ответил». Урезанные подробности (truncated) говорят об
 * этом и ведут в журнал шага, где вызов целиком; Allow за столом остаётся - человек может
 * посмотреть журнал, а телефон урезанное одобрить не даёт.
 */
export const RunQuestionCard = ({ place, runId, question, onOpenLog }: RunQuestionCardProps) => {
  const { t } = useTranslation()
  const actions = useScenarioActions()
  const [text, setText] = useState('')
  const isPermission = question.options.length === 0
  const title = question.title || question.tool

  const answer = (allow: boolean, words: string) => {
    void actions.answer(place, runId, allow, words)
    setText('')
  }

  const handleOption = (option: string) => () => answer(true, option)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isPermission || text.trim()) answer(true, text.trim())
  }

  const handleRefuse = () => answer(false, text.trim())

  return (
    <Card
      tone="accent"
      icon={MessageCircleQuestion}
      title={t('scenarios.run.question.title')}
      description={t('scenarios.run.question.nothingSpent')}>
      <div className={styles.question}>
        <div className={styles.questionHead}>
          <span className={styles.questionTitle}>{title}</span>
          {question.title && question.tool && <Badge variant="soft">{question.tool}</Badge>}
        </div>
        {isPermission && question.detail && (
          <div className={styles.questionDetail}>
            <CodeSnippet
              code={detailText(question.detail)}
              copyLabel={t('scenarios.run.question.copy')}
              copiedLabel={t('scenarios.run.question.copied')}
            />
          </div>
        )}
        {question.truncated && (
          <div role="note" className={styles.questionTrimmed}>
            <span className={styles.questionTrimmedText}>
              {t('scenarios.run.question.trimmed')}
            </span>
            {onOpenLog && (
              <Button size="sm" variant="secondary" icon={ScrollText} onClick={onOpenLog}>
                {t('scenarios.run.question.openLog')}
              </Button>
            )}
          </div>
        )}
        {!isPermission && (
          <div className={styles.questionOptions}>
            {question.options.map((option) => (
              <Button key={option} size="sm" variant="secondary" onClick={handleOption(option)}>
                {option}
              </Button>
            ))}
          </div>
        )}
        <form className={styles.questionAnswer} onSubmit={handleSubmit}>
          <div className={styles.questionField}>
            <TextField
              hideLabel
              label={t('scenarios.run.question.placeholder')}
              placeholder={t('scenarios.run.question.placeholder')}
              value={text}
              onChange={setText}
            />
          </div>
          {isPermission ? (
            <>
              <Button type="submit" variant="primary">
                {t('scenarios.run.question.allow')}
              </Button>
              <Button type="button" onClick={handleRefuse}>
                {t('scenarios.run.question.refuse')}
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={!text.trim()}>
              {t('scenarios.run.question.send')}
            </Button>
          )}
        </form>
      </div>
    </Card>
  )
}
