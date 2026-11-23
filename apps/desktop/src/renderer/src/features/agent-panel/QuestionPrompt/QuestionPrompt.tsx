import { X, ChevronUp, ChevronDown, MessageCircleQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useQuestion } from './QuestionPrompt.hooks'
import styles from './QuestionPrompt.module.scss'
import type { QuestionPromptProps } from './QuestionPrompt.types'
import { QuestionBlock } from './parts/QuestionBlock'

/**
 * Вопрос модели с вариантами (AskUserQuestion) над полем ввода, как в ACC: цифры
 * выбирают вариант, Enter отправляет или ведёт к следующему вопросу; карточку можно
 * свернуть, × - ответить своими словами в поле. Ход ждёт ответа сколько угодно.
 */
export const QuestionPrompt = (props: QuestionPromptProps) => {
  const { request } = props
  const { t } = useTranslation()
  const question = useQuestion(props)
  const total = request.questions.length

  return (
    <div className={styles.questionPrompt}>
      <Card
        tone="accent"
        icon={MessageCircleQuestion}
        // Вопрос мода CLI ($.ui.ask) - та же карточка, но видно, кто спрашивает.
        title={request.fromMod ? t('agentPanel.mods.asks') : t('agentPanel.question.title')}
        actions={
          <>
            <span className={styles.progress}>
              {/* Вопрос, на котором оборвался разговор из истории: ход давно кончился. */}
              {request.reopened
                ? t('agentPanel.question.leftOver', { count: total })
                : t('agentPanel.question.blocks', { count: total })}
            </span>
            <IconButton
              icon={question.isCollapsed ? ChevronUp : ChevronDown}
              size="sm"
              label={
                question.isCollapsed
                  ? t('agentPanel.question.expand')
                  : t('agentPanel.question.collapse')
              }
              onClick={question.toggleCollapsed}
            />
            <IconButton
              icon={X}
              size="sm"
              label={t('agentPanel.question.dismiss')}
              onClick={question.dismiss}
            />
          </>
        }>
        {!question.isCollapsed && (
          <>
            <div className={styles.questions}>
              {request.questions.map((item, index) => (
                <QuestionBlock
                  key={item.question}
                  projectId={props.projectId}
                  question={item}
                  index={index}
                  draft={question.draft}
                  isKeyed={index === question.active}
                  grabsFocus={question.openedHere.includes(index)}
                  onPick={(label) => {
                    question.setActive(index)
                    question.pick(index, label)
                  }}
                  onOther={() => {
                    question.setActive(index)
                    question.openOther(index)
                  }}
                  onOwnAnswer={(tokens) => question.writeOwn(index, tokens)}
                  onFocus={() => question.setActive(index)}
                />
              ))}
            </div>
            <div className={styles.actions}>
              <Button
                variant="primary"
                size="sm"
                disabled={!question.answered}
                onClick={question.submit}>
                {question.answered
                  ? t('agentPanel.question.submit')
                  : t('agentPanel.question.pick')}
              </Button>
              <span className={styles.note}>
                {request.reopened
                  ? t('agentPanel.question.leftOverNote')
                  : t('agentPanel.question.note')}
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
