import type {
  Question,
  PendingRequest,
  PermissionMode,
  RequestResponse,
} from '@shared/conversation'
import type { ToolAction } from '@shared/conversation-feed'

import { mcpTool } from '../feed/codex-tools'
import type { RpcId } from '../../process/rpc-lines'
import type { HeldRequest } from '../../agents/conversation/agent-parts'
import type { McpAsk } from './codex-mcp-approval'
import { mcpAskOf, mcpApprovalAnswer } from './codex-mcp-approval'

/**
 * Вопросы сервера Codex к человеку (docs/plan-providers/30-codex.md): разрешение на команду,
 * правку, права, вызов инструмента MCP (codex-mcp-approval.ts), вопрос с вариантами, MCP по
 * ссылке - в общие вопросы панели и ответы обратно.
 */

/** Вопрос Codex, который держит разговор: общий вид и то, что нужно для ответа. */
export type CodexHeld = HeldRequest & {
  rpcId: RpcId
  method: string
  /** id вопросов `requestUserInput` по их тексту: панель отвечает по тексту. */
  questionIds: Record<string, string>
  /** Одобрение вызова инструмента MCP - о каком вызове; null - другой вопрос. */
  approval: McpAsk | null
}

export const isCodexHeld = (held: HeldRequest): held is CodexHeld =>
  'rpcId' in held && 'method' in held

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

/** Что вызов сделает - по нему карточка решает заголовок и показ. */
export type ToolFacts = { name: string; input: Record<string, unknown>; action: ToolAction }

/** Вызовы ленты для вопроса: по id элемента и идущий вызов MCP, о котором спрашивают. */
export type CallLookup = {
  facts: (itemId: string) => ToolFacts
  /** id вызова ленты, который ждёт одобрения; null - его в ленте нет. */
  mcpCall: (ask: McpAsk) => string | null
}

/** Разрешение панели. alwaysKind null - Codex не умеет «и дальше» для этого вопроса. */
const permission = (
  requestId: string,
  toolUseId: string,
  facts: ToolFacts,
  description: string,
  reason: string,
  mode: PermissionMode,
  // «Разрешить и дальше» у Codex - на всю сессию (acceptForSession).
  alwaysKind: 'rule' | null = 'rule',
): PendingRequest => ({
  kind: 'permission',
  requestId,
  toolUseId,
  toolName: facts.name,
  input: facts.input,
  action: facts.action,
  description,
  reason,
  alwaysKind,
  mode,
})

const questionsOf = (params: Record<string, unknown>) => {
  const raw = Array.isArray(params['questions']) ? params['questions'].filter(isRecord) : []
  const questions: Question[] = raw.map((item) => {
    const options = (Array.isArray(item['options']) ? item['options'].filter(isRecord) : []).map(
      (option) => ({ label: text(option, 'label'), description: text(option, 'description') }),
    )

    // Без вариантов ответ только своими словами; с вариантами - если Codex разрешил (isOther).
    return {
      question: text(item, 'question'),
      header: text(item, 'header'),
      options,
      multiSelect: false,
      other: options.length === 0 || item['isOther'] === true,
      secret: item['isSecret'] === true,
    }
  })
  const questionIds = Object.fromEntries(
    raw.map((item) => [text(item, 'question'), text(item, 'id')]),
  )

  return { questions, questionIds }
}

/**
 * Одобрение вызова MCP - разрешением у его строки в ленте. Строки нет (вызов не дошёл до
 * ленты) - разрешением с вызовом, собранным из вопроса. «Разрешить и дальше» - только если
 * Codex умеет помнить одобрение до конца сессии.
 */
const holdMcpApproval = (
  base: Omit<CodexHeld, 'pending' | 'approval'>,
  ask: McpAsk,
  message: string,
  requestId: string,
  mode: PermissionMode,
  calls: CallLookup,
): CodexHeld => {
  const itemId = calls.mcpCall(ask)
  const facts: ToolFacts = itemId
    ? calls.facts(itemId)
    : mcpTool(
        {
          type: 'mcpToolCall',
          id: requestId,
          server: ask.server,
          tool: ask.tool,
          arguments: ask.params,
          status: 'inProgress',
        },
        { parent: null, startedAt: 0, endedAt: 0 },
      )

  return {
    ...base,
    approval: ask,
    pending: permission(
      requestId,
      itemId ?? requestId,
      facts,
      message,
      '',
      mode,
      ask.session ? 'rule' : null,
    ),
  }
}

/**
 * Вопрос сервера - в вопрос панели. requestId - id в окне (`codex-<эпоха>-<rpc id>`: id
 * запросов начинаются заново в каждом процессе). calls - вызов, о котором спрашивают (по
 * itemId из ленты или идущий вызов MCP); null - незнакомый вопрос: Codex получит отказ сразу.
 */
export const holdServerRequest = (
  rpcId: RpcId,
  method: string,
  params: unknown,
  requestId: string,
  mode: PermissionMode,
  calls: CallLookup,
): CodexHeld | null => {
  const body = isRecord(params) ? params : {}
  const itemId = text(body, 'itemId')
  const reason = text(body, 'reason')
  const base = { rpcId, method, questionIds: {}, approval: null }

  switch (method) {
    case 'item/commandExecution/requestApproval': {
      const command = text(body, 'command')
      const facts: ToolFacts = {
        name: 'shell',
        input: { command },
        action: { kind: 'command', command, description: '' },
      }

      return { ...base, pending: permission(requestId, itemId, facts, command, reason, mode) }
    }
    case 'item/fileChange/requestApproval': {
      const facts = calls.facts(itemId)

      return { ...base, pending: permission(requestId, itemId, facts, facts.name, reason, mode) }
    }
    case 'item/permissions/requestApproval': {
      const facts: ToolFacts = {
        name: 'permissions',
        input: body,
        action: { kind: 'other', target: reason, path: '' },
      }

      return { ...base, pending: permission(requestId, itemId, facts, reason, reason, mode) }
    }
    case 'mcpServer/elicitation/request': {
      const ask = mcpAskOf(body)

      if (ask) return holdMcpApproval(base, ask, text(body, 'message'), requestId, mode, calls)

      const url = text(body, 'url')
      const facts: ToolFacts = {
        name: 'mcp_login',
        input: body,
        action: { kind: 'web', target: url },
      }

      return text(body, 'mode') === 'url'
        ? {
            ...base,
            pending: permission(
              requestId,
              itemId || requestId,
              facts,
              url,
              text(body, 'message'),
              mode,
            ),
          }
        : null
    }
    case 'item/tool/requestUserInput': {
      const { questions, questionIds } = questionsOf(body)

      return {
        ...base,
        questionIds,
        pending: { kind: 'question', requestId, toolUseId: itemId, questions },
      }
    }
    default:
      return null
  }
}

/** Отказ на вопрос, снятый остановкой или откатом, - словами вида вопроса. */
export const declineFor = (held: CodexHeld): unknown =>
  answerFor(held, { kind: 'permission', decision: { behavior: 'deny', message: '' } })

/** Ответ человека - в ответ сервера на его вопрос. */
export const answerFor = (held: CodexHeld, response: RequestResponse): unknown => {
  if (held.method === 'item/tool/requestUserInput') {
    const answers = response.kind === 'question' ? response.answers : {}

    return {
      // Вопрос Codex - с одним ответом: свой текст с запятой - один ответ, а не несколько.
      answers: Object.fromEntries(
        Object.entries(answers).map(([question, answer]) => [
          held.questionIds[question] ?? question,
          { answers: answer ? [answer] : [] },
        ]),
      ),
    }
  }

  const allowed = response.kind === 'permission' && response.decision.behavior !== 'deny'
  const always = response.kind === 'permission' && response.decision.behavior === 'allowAlways'

  if (held.method === 'mcpServer/elicitation/request') {
    return held.approval
      ? mcpApprovalAnswer(allowed, always, held.approval.session)
      : { action: allowed ? 'accept' : 'decline', content: null, _meta: null }
  }

  if (held.method === 'item/permissions/requestApproval') {
    const params = held.pending.kind === 'permission' ? held.pending.input : {}

    return allowed
      ? { permissions: params['permissions'] ?? {}, scope: always ? 'session' : 'turn' }
      : { permissions: {}, scope: 'turn' }
  }

  return { decision: allowed ? (always ? 'acceptForSession' : 'accept') : 'decline' }
}
