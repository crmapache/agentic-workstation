import type { ConversationUsage } from '@shared/conversation'

import type { CliMessage } from '../cli/cli-messages'
import { isRecord, numberField, recordField, recordsField } from '../cli/cli-messages'

/** Сколько контекста занимает запрос: вход плюс прочитанное и записанное в кэш. */
const promptTokens = (usage: Record<string, unknown>) =>
  numberField(usage, 'input_tokens') +
  numberField(usage, 'cache_read_input_tokens') +
  numberField(usage, 'cache_creation_input_tokens')

/** Оценка занятого контекста по ответу модели, пока идёт ход. 0 - оценить нечем. */
export const liveContextTokens = (assistant: CliMessage): number =>
  promptTokens(recordField(recordField(assistant, 'message'), 'usage'))

/**
 * Контекст и окно из `result`. Верхние поля usage - сумма по всем шагам хода, поэтому
 * занятый контекст - по последнему шагу (iterations); шагов нет, а их было несколько -
 * верхним полям не верим. Окно - модели разговора: modelUsage несёт и модели субагентов,
 * и у субагента на модели с окном пошире процент считался бы от чужого окна.
 */
export const usageFromResult = (
  result: CliMessage,
  previous: ConversationUsage,
  model: string | null,
): ConversationUsage => {
  const usage = recordField(result, 'usage')
  const iterations = recordsField(usage, 'iterations')
  const last = iterations.at(-1)
  const turns = numberField(result, 'num_turns')
  const contextTokens = last
    ? promptTokens(last)
    : turns <= 1
      ? promptTokens(usage)
      : previous.contextTokens
  const modelUsage = recordField(result, 'modelUsage')
  const own = model ? numberField(recordField(modelUsage, model), 'contextWindow') : 0
  const models = Object.values(modelUsage).filter(isRecord)
  const contextWindow =
    own || Math.max(0, ...models.map((entry) => numberField(entry, 'contextWindow')))

  return {
    contextTokens: contextTokens || previous.contextTokens,
    contextWindow: contextWindow || previous.contextWindow,
  }
}

/** Точные цифры из ответа на `get_context_usage`. Непонятный ответ - прежние цифры. */
export const usageFromContextReply = (
  reply: unknown,
  previous: ConversationUsage,
): ConversationUsage => {
  if (!isRecord(reply)) return previous

  const total = numberField(reply, 'totalTokens')
  const max = numberField(reply, 'maxTokens')

  return {
    ...previous,
    contextTokens: total || previous.contextTokens,
    contextWindow: max || previous.contextWindow,
  }
}
