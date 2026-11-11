import type { ToolAccess } from '@shared/connectors'

/** Глаголы, с которых начинаются инструменты чтения. */
const READ_VERBS = new Set([
  'get',
  'list',
  'search',
  'read',
  'fetch',
  'find',
  'query',
  'view',
  'describe',
  'lookup',
  'retrieve',
  'download',
  'count',
  'check',
  'suggest',
])

/** Слова, которые значат «это увидят другие люди». */
const OUTBOUND_WORDS = new Set([
  'send',
  'reply',
  'forward',
  'post',
  'publish',
  'schedule',
  'react',
  'reaction',
  'reactions',
  'invite',
  'share',
  'respond',
  'notify',
  // Назначить задачу человеку - ему уходит уведомление (Todoist manage-assignments).
  'assign',
  'assignment',
  'assignments',
])

/** Что, созданное или изменённое, сразу видят другие люди (комментарий, канал, холст Slack). */
const OUTBOUND_OBJECTS = new Set([
  'comment',
  'comments',
  'canvas',
  'canvases',
  'channel',
  'channels',
  'conversation',
  'conversations',
  'message',
  'messages',
])

/** Служебные начала имён, которые сервис ставит перед глаголом (slack_send_message). */
const SERVICE_WORDS = new Set([
  'slack',
  'notion',
  'gmail',
  'calendar',
  'google',
  'atlassian',
  'mcp',
])

/** Имя инструмента словами: snake_case, kebab-case, точки и camelCase. */
const wordsOf = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !SERVICE_WORDS.has(word))

export type ToolHints = {
  /** Пометка MCP: инструмент ничего не меняет. */
  readOnlyHint?: boolean | undefined
}

/**
 * Ступень доступа чужого инструмента (Notion, Slack, свой MCP) - по пометке MCP и имени.
 * Пометка «только чтение» главнее слов отправки: такой инструмент ничего не меняет. И
 * чтение по имени (get_comments) - не отправка, даже со словом comment. В остальном
 * ошибиться в сторону «отправка» безопаснее: её включает человек одним переключателем.
 */
export const classifyTool = (name: string, hints: ToolHints = {}): ToolAccess => {
  const words = wordsOf(name)
  const verb = words[0] ?? ''

  if (hints.readOnlyHint === true || READ_VERBS.has(verb)) return 'read'

  if (words.some((word) => OUTBOUND_WORDS.has(word))) return 'outbound'

  if (words.some((word) => OUTBOUND_OBJECTS.has(word))) return 'outbound'

  return 'write'
}

/**
 * Включён ли инструмент: выбор человека, а без него - всё, кроме отправки людям.
 * Отправку по умолчанию не включает никто: ни IDE, ни модель (ADR 0028).
 */
export const isToolEnabled = (access: ToolAccess, override: boolean | undefined): boolean =>
  override ?? access !== 'outbound'
