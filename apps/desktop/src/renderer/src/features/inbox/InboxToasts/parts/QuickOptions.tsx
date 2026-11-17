import { Button } from '@agentic-workstation/ui/Button'

import type { InboxToastProps } from '../InboxToasts.types'
import { useInboxActions } from '../../inbox.actions'

/**
 * Варианты вопроса прогона кнопками прямо в углу окна - когда ответ одно нажатие (один вопрос,
 * один ответ). Своё слово и несколько вопросов - на виде уведомлений.
 */
export const QuickOptions = ({ item }: InboxToastProps) => {
  const actions = useInboxActions()
  const answer = item.actions.find((one) => one.kind === 'answer')
  const question = item.questions[0]

  if (!answer || !question) return null

  return (
    <>
      {question.options.map(({ label }) => (
        <Button
          key={label}
          size="sm"
          variant="secondary"
          onClick={() => void actions.act(item, answer, '', { [question.question]: label })}>
          {label}
        </Button>
      ))}
    </>
  )
}
