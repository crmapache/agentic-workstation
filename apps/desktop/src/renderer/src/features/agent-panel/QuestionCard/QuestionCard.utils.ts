import type { ToolFeedItem } from '@shared/conversation-feed'

/** Тексты вопросов вызова. */
const questionTitles = (tool: ToolFeedItem): string[] =>
  tool.action.kind === 'question' ? tool.action.questions : []

/**
 * Пары «вопрос - ответ» из результата AskUserQuestion: CLI пишет их модели парами
 * `"вопрос"="ответ"`. Закрытый крестиком вопрос ответов не несёт - пусто, строки нет.
 */
export const answerPairs = (tool: ToolFeedItem): { question: string; answer: string }[] => {
  if (tool.status !== 'done' || !tool.result) return []

  const answers = new Map(
    [...tool.result.text.matchAll(/"([^"]+)"="([^"]*)"/g)].map(([, question = '', answer = '']) => [
      question,
      answer,
    ]),
  )

  return questionTitles(tool)
    .map((question) => ({ question, answer: answers.get(question) ?? '' }))
    .filter((pair) => pair.answer.trim())
}

/** Время ЧЧ:ММ - когда ответили. */
export const clockTime = (at: number): string =>
  new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
