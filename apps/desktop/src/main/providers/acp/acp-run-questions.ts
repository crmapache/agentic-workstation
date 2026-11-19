import type { PermissionMode } from '@shared/conversation'

import { toolQuestion, engineAnswerOf, questionWithdrawn } from '../run-stream/claude-stream'
import { responseOf, engineQuestionOf } from '../run-stream/engine-questions'
import type { AcpAgent } from '../../acp/acp-agent'
import { unsupported } from '../../acp/client/acp-process'
import type { AcpHeld } from '../../acp/conversation/acp-requests'
import {
  replyOf,
  holdForm,
  dismissedReply,
  holdPermission,
} from '../../acp/conversation/acp-requests'
import type {
  AcpToolCall,
  AcpToolKind,
  AcpPermissionRequest,
  AcpElicitationRequest,
} from '../../acp/protocol/acp-types'
import type { ControlRequest } from '../../claude/cli/cli-messages'
import type { AcpRunCalls } from './acp-run-calls'
import type { AcpRunRules } from './acp-run-rules'
import { ownAnswer, stayInPlan } from './acp-run-rules'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Что вопросам прогона нужно от процесса сессии. */
export type AcpRunAsker = {
  agent: Pick<AcpAgent, 'toolId'>
  calls: AcpRunCalls
  /** Режим прогона словами IDE - в вопросе разрешения. */
  mode: PermissionMode
  rules: () => AcpRunRules
  /** Вызов, которого ещё не было в обновлениях, встал из вопроса: журналу. */
  seen: (call: AcpToolCall) => void
  /** Движку - вопрос или что вопрос снят. */
  ask: (request: ControlRequest) => void
  /** Движок одобрил план: из плана агент выходит молча. */
  planAnswered: () => void
}

/**
 * Вопросы агента ACP в прогоне (ADR 0085): разрешение, одобрение плана и форма - движку словами
 * Claude (`can_use_tool`: команда - `Bash`, правка - `Edit`/`Write`, выбор - `AskUserQuestion`,
 * план - `ExitPlanMode`), его ответ - обратно словами ACP. Что прогон решает сам (свои серверы
 * IDE, только чтение), до движка не доходит. Снятый вопрос - отказ без выбора агенту и
 * `control_cancel_request` движку.
 */
export class AcpRunQuestions {
  private asked = 0
  private readonly held = new Map<string, AcpHeld>()

  constructor(private readonly run: AcpRunAsker) {}

  /** Запрос агента к клиенту; незнакомый - отказ `-32601`. */
  requested(method: string, params: unknown): Promise<unknown> {
    if (!isRecord(params)) return unsupported(method)

    if (method === 'session/request_permission') {
      const request = params as AcpPermissionRequest
      const { toolCallId } = request.toolCall
      const { calls, agent, mode } = this.run

      // Вызова, о котором спрашивают, ещё не было в обновлениях - он встаёт из самого вопроса.
      if (!calls.view(toolCallId)) this.run.seen(request.toolCall)

      const view = calls.view(toolCallId)
      const toolUseId = agent.toolId(toolCallId)

      return this.hold(
        (requestId, reply) => holdPermission(requestId, request, toolUseId, view, mode, reply),
        calls.kind(toolCallId),
      )
    }

    if (method === 'elicitation/create') {
      const request = params as AcpElicitationRequest

      // Только формы: переход по ссылке IDE не объявляет.
      if (request.mode !== 'form') return Promise.resolve({ action: 'decline' })

      return this.hold((requestId, reply) => holdForm(requestId, request, reply), null)
    }

    return unsupported(method)
  }

  /** Ответ движка словами Claude (`{behavior, updatedInput | message}`). */
  respond(requestId: string, response: Record<string, unknown>): void {
    const held = this.held.get(requestId)

    if (!held) return

    this.held.delete(requestId)

    const answer = engineAnswerOf(response)

    // Отказ на форму - отказ ответить, а не пустые ответы; отказ плану - доработать его.
    if (!answer.allow && held.source === 'form') return held.reply({ action: 'decline' })
    if (!answer.allow && held.source === 'plan') return held.reply(stayInPlan(held))
    if (held.source === 'plan') this.run.planAnswered()

    held.reply(replyOf(held, responseOf(held.pending, answer)))
  }

  /** Вопросы без ответа (ход кончился, Stop): агенту - отказ без выбора, движку - что сняты. */
  withdrawAll(tellEngine: boolean): void {
    for (const [requestId, held] of this.held) {
      held.reply(dismissedReply(held))
      if (tellEngine) this.run.ask(questionWithdrawn(requestId))
    }

    this.held.clear()
  }

  private hold(
    make: (requestId: string, reply: (result: unknown) => void) => AcpHeld,
    kind: AcpToolKind | null,
  ): Promise<unknown> {
    return new Promise((reply) => {
      this.asked += 1

      const requestId = `acp-run-${this.asked}`
      const held = make(requestId, reply)
      const own = ownAnswer(held, this.run.rules(), kind)

      if (own !== null) {
        reply(own)

        return
      }

      const question = engineQuestionOf(held.pending)

      this.held.set(requestId, held)
      this.run.ask(toolQuestion(requestId, question.toolName, question.input, question.description))
    })
  }
}
