import type { Conversation, RequestResponse } from '@shared/conversation'

import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { claudeOf } from './claude-conversation'
import { parseQuestions } from './pending-requests'

/** Префикс id ожившего вопроса: управляющего запроса CLI под ним нет. */
const REOPENED_PREFIX = 'reopened:'

/** Разговоры, которым факты транскрипта уже отданы: лента читается один раз. */
const applied = new WeakSet<ConversationRuntime>()

/**
 * Прочитанный транскрипт - во вкладку: модель берётся из последнего ответа (вкладка из
 * истории иначе не знала бы, на чём шёл разговор), а вопрос, на котором разговор
 * оборвался, оживает над полем (как в ACC): иначе его варианты нигде не видны.
 */
export const applyReplayFacts = (runtime: ConversationRuntime): void => {
  if (applied.has(runtime)) return

  applied.add(runtime)

  const { model, abandonedQuestion } = claudeOf(runtime).feed.builder.replayFacts
  const change: Partial<Conversation> = {}

  if (model && !runtime.meta.activeModel) change.activeModel = model

  const questions = abandonedQuestion ? parseQuestions(abandonedQuestion.input) : []

  if (abandonedQuestion && questions.length > 0 && !runtime.meta.pending && !runtime.turnActive) {
    change.pending = {
      kind: 'question',
      requestId: `${REOPENED_PREFIX}${abandonedQuestion.id}`,
      toolUseId: abandonedQuestion.id,
      questions,
      reopened: true,
    }
    change.pendingCount = 1
  }

  if (Object.keys(change).length > 0) runtime.update(change)
}

/** Ответы ожившего вопроса текстом: вопрос и под ним ответ, как их видит модель. */
export const reopenedAnswerText = (answers: Record<string, string>): string =>
  Object.entries(answers)
    .filter(([question, answer]) => question.trim() && answer.trim())
    .map(([question, answer]) => `${question}\n${answer}`)
    .join('\n\n')

/**
 * Ответ на оживший вопрос: вызова, который спрашивал, больше нет, поэтому ответ уходит
 * новым сообщением, а закрытый крестиком - просто снимается. false - это не он.
 */
export const answerReopened = (
  runtime: ConversationRuntime,
  requestId: string,
  response: RequestResponse,
): boolean => {
  const { pending } = runtime.meta

  if (pending?.kind !== 'question' || !pending.reopened || pending.requestId !== requestId) {
    return false
  }

  runtime.update({ pending: null, pendingCount: 0 })

  const text = response.kind === 'question' ? reopenedAnswerText(response.answers) : ''

  if (text) {
    runtime.send({ text, images: [] }).catch((error: unknown) => {
      console.warn('[claude] ответ на оживший вопрос не ушёл:', error)
    })
  }

  return true
}
