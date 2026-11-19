import type { ToolAction } from '@shared/conversation-feed'

import type { AcpToolLens } from '../acp/feed/acp-feed-builder'

const text = (input: Record<string, unknown>, ...keys: string[]): string => {
  for (const key of keys) {
    const value = input[key]

    if (typeof value === 'string' && value) return value
  }

  return ''
}

/** Вызов коннектора у Kimi: имя `mcp__<сервер>__<инструмент>`, как у Claude Code. */
const mcpOf = (name: string): ToolAction | null => {
  const match = /^mcp__(.+?)__(.+)$/.exec(name)

  return match?.[1] && match[2]
    ? { kind: 'mcp', server: match[1], tool: match[2], target: '', path: '' }
    : null
}

/**
 * Своё Kimi о вызовах (ADR 0092): имя инструмента - `title` первого сообщения о вызове (`Read`,
 * `Grep`, `Bash`, `AskUserQuestion`, `ExitPlanMode`, `mcp__<сервер>__<инструмент>`). Поиск Kimi
 * присылает с видом `read` - здесь он поиск.
 */
export const kimiLens: AcpToolLens = (_call, base) => {
  const mcp = mcpOf(base.name)

  if (mcp) return { ...base, action: mcp }

  switch (base.name) {
    case 'Grep':
    case 'Glob':
      return {
        ...base,
        action: {
          kind: 'search',
          pattern: text(base.input, 'pattern', 'glob'),
          path: text(base.input, 'path'),
        },
      }
    case 'AskUserQuestion':
      return { ...base, action: { kind: 'question', questions: [] } }
    case 'ExitPlanMode':
      return { ...base, action: { kind: 'plan', plan: text(base.input, 'plan') } }
    case 'TodoWrite':
    case 'SetTodoList':
      return { ...base, action: { kind: 'todo' } }
    default:
      return base
  }
}
