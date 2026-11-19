/**
 * Части протокола `codex app-server`, на которые опирается IDE (docs/plan-providers/30-codex.md).
 * Один перечень на код и на проверку расхождения со схемой установленного Codex
 * (protocol-drift.test.ts): метод пропал или переименован - тест скажет раньше человека.
 */

/** Запросы клиента. */
export const CLIENT_METHODS = [
  'initialize',
  'thread/start',
  'thread/resume',
  'thread/fork',
  'thread/revert',
  'thread/list',
  'thread/read',
  'thread/turns/list',
  'thread/name/set',
  'thread/compact/start',
  'turn/start',
  'turn/steer',
  'turn/interrupt',
  'model/list',
  'account/read',
  'account/rateLimits/read',
  'config/read',
  'skills/list',
  'review/start',
  'config/mcpServer/reload',
] as const

/** Уведомления сервера, которые разбирает IDE. */
export const SERVER_NOTIFICATIONS = [
  'error',
  'thread/started',
  'thread/name/updated',
  'thread/tokenUsage/updated',
  'thread/compacted',
  'turn/started',
  'turn/completed',
  'turn/plan/updated',
  'item/started',
  'item/completed',
  'item/agentMessage/delta',
  'item/reasoning/summaryTextDelta',
  'item/reasoning/textDelta',
  'account/rateLimits/updated',
  'model/rerouted',
  'serverRequest/resolved',
] as const

/** Запросы сервера к клиенту - вопросы человеку. */
export const SERVER_REQUESTS = [
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/tool/requestUserInput',
  'item/permissions/requestApproval',
  'mcpServer/elicitation/request',
] as const

/** Виды элементов разговора, которые IDE переводит в ленту. */
export const THREAD_ITEM_TYPES = [
  'userMessage',
  'agentMessage',
  'reasoning',
  'plan',
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'dynamicToolCall',
  'collabAgentToolCall',
  'webSearch',
  'imageView',
  'contextCompaction',
] as const

export type ClientMethod = (typeof CLIENT_METHODS)[number]
export type ServerNotification = (typeof SERVER_NOTIFICATIONS)[number]
export type ServerRequestMethod = (typeof SERVER_REQUESTS)[number]
export type ThreadItemType = (typeof THREAD_ITEM_TYPES)[number]
