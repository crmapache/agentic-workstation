import type { AiJobActivity } from '@shared/connector-spec'

import type { CliMessage } from '../cli/cli-messages'
import { isRecord, recordField, stringField, recordsField } from '../cli/cli-messages'
import { STRUCTURED_OUTPUT } from '../feed/agent-tasks.constants'
import type { AiChatTurnEnd } from '../../connectors/ai/ai-chat'
import { DETAIL_MAX_CHARS } from './connector-chat.constants'

/** Шаг по вызову инструмента: что искали, какую страницу читали, что пишут ответ. */
const activityOfTool = (name: string, input: Record<string, unknown>): AiJobActivity | null => {
  if (name === 'WebSearch') return { kind: 'search', subject: stringField(input, 'query') }
  if (name === 'WebFetch') return { kind: 'read', subject: stringField(input, 'url') }
  if (name === STRUCTURED_OUTPUT) return { kind: 'answer', subject: '' }

  return null
}

/**
 * Что ИИ делает - по последнему вызову в сообщении основного потока: поиск, чтение страницы,
 * ответ. Сообщение без вызова (текст, мысли) шага не меняет - null.
 */
export const activityOf = (message: CliMessage): AiJobActivity | null => {
  if (message.type !== 'assistant' || message['parent_tool_use_id']) return null

  const blocks = recordsField(recordField(message, 'message'), 'content')

  for (const block of [...blocks].reverse()) {
    if (block['type'] !== 'tool_use') continue

    const input = block['input']
    const activity = activityOfTool(stringField(block, 'name'), isRecord(input) ? input : {})

    if (activity) return activity
  }

  return null
}

/** Слова CLI об ошибке хода: текст итога, список ошибок или хотя бы его вид. */
const errorOf = (result: CliMessage): string => {
  const errors = result['errors']
  const listed = Array.isArray(errors)
    ? errors.filter((item): item is string => typeof item === 'string').join('\n')
    : ''

  return (stringField(result, 'result') || listed || stringField(result, 'subtype')).slice(
    0,
    DETAIL_MAX_CHARS,
  )
}

/**
 * Итог хода по строке `result`: ответ по схеме (`structured_output`), остановка или ошибка.
 * Остановленный ход - остановка, что бы CLI ни написал: он кончает такой ход ошибкой.
 */
export const turnEndOf = (result: CliMessage, stopped: boolean): AiChatTurnEnd => {
  if (stopped) return { kind: 'stopped' }

  const output = result['structured_output']

  if (result['is_error'] !== true && output !== undefined) return { kind: 'answer', output }

  return { kind: 'failed', error: 'failed', detail: errorOf(result) }
}
