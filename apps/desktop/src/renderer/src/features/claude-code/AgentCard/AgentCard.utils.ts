import type { FeedItem, ToolFeedItem } from '@shared/claude-feed'

import { PROMPT_SHOWN_CHARS } from '../agents.constants'

/** Задание агента из вида действия вызова; не агент - пусто. */
const promptOf = (tool: ToolFeedItem): string =>
  tool.action.kind === 'agent' ? tool.action.prompt : ''

/**
 * Задание агента для карточки: как написано, но не длиннее предела - суть поручения
 * всегда в начале, а хвост инструкций читать в ленте некому.
 */
export const errandOf = (tool: ToolFeedItem): string => {
  const prompt = promptOf(tool).trim()

  return prompt.length > PROMPT_SHOWN_CHARS ? `${prompt.slice(0, PROMPT_SHOWN_CHARS)}…` : prompt
}

/** Есть ли что раскрыть: задание, шаги, флот, итог или причина закрытия. */
export const hasBody = (tool: ToolFeedItem, steps: readonly FeedItem[]): boolean =>
  Boolean(promptOf(tool)) ||
  steps.length > 0 ||
  Boolean(tool.task?.steps.length) ||
  Boolean(tool.task?.fleet) ||
  Boolean(tool.result?.text) ||
  tool.status === 'running' ||
  tool.status === 'interrupted'
