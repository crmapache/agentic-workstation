import type {
  Question,
  PendingRequest,
  PermissionMode,
  RequestResponse,
} from '@shared/conversation'
import type { ToolAction } from '@shared/conversation-feed'

import type { RpcId } from '../app-server/rpc-lines'
import type { HeldRequest } from '../../agents/conversation/agent-parts'

/**
 * Вопросы сервера Codex к человеку (docs/plan-providers/30-codex.md): разрешение на команду,
 * правку, права, вопрос с вариантами, MCP по ссылке - в общие вопросы панели и ответы обратно.
 */

/** Вопрос Codex, который держит разговор: общий вид и то, что нужно для ответа. */
export type CodexHeld = HeldRequest & {
  rpcId: RpcId
  method: string
  /** id вопросов `requestUserInput` по их тексту: панель отвечает по тексту. */
  questionIds: Record<string, string>
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

const permission = (
  requestId: string,
  toolUseId: string,
  facts: ToolFacts,
  description: string,
  reason: string,
  mode: PermissionMode,
): PendingRequest => ({
  kind: 'permission',
  requestId,
  toolUseId,
  toolName: facts.name,
  input: facts.input,
  action: facts.action,
  description,
  reason,
  // «Разрешить и дальше» у Codex - на всю сессию (acceptForSession).
  alwaysKind: 'rule',
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
 * Вопрос сервера - в вопрос панели. requestId - id в окне (`codex-<эпоха>-<rpc id>`: id
 * запросов начинаются заново в каждом процессе). facts - вызов, о котором спрашивают (по
 * itemId из ленты); null - незнакомый вопрос: Codex получит отказ сразу.
 */
export const holdServerRequest = (
  rpcId: RpcId,
  method: string,
  params: unknown,
  requestId: string,
  mode: PermissionMode,
  factsOf: (itemId: string) => ToolFacts,
): CodexHeld | null => {
  const body = isRecord(params) ? params : {}
  const itemId = text(body, 'itemId')
  const reason = text(body, 'reason')
  const base = { rpcId, method, questionIds: {} }

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
      const facts = factsOf(itemId)

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
    return { action: allowed ? 'accept' : 'decline', content: null, _meta: null }
  }

  if (held.method === 'item/permissions/requestApproval') {
    const params = held.pending.kind === 'permission' ? held.pending.input : {}

    return allowed
      ? { permissions: params['permissions'] ?? {}, scope: always ? 'session' : 'turn' }
      : { permissions: {}, scope: 'turn' }
  }

  return { decision: allowed ? (always ? 'acceptForSession' : 'accept') : 'decline' }
}
