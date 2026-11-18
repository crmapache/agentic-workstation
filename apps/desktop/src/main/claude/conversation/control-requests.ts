import type { ControlRequest } from '../cli/cli-messages'
import type { CliProcess } from '../cli/cli-process'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { UNSUPPORTED_REQUEST } from './conversation.constants'
import { holdRequest } from './pending-requests'

/**
 * Управляющий запрос CLI к разговору. Снятый вопрос уходит, и очередь может идти; вопрос
 * человеку (разрешение, выбор, план) ждёт ответа без таймеров и зовёт человека; всё, чего
 * панель не умеет, - отказ сразу: без ответа ход висел бы вечно.
 */
export const takeControlRequest = (
  runtime: ConversationRuntime,
  process: CliProcess,
  request: ControlRequest,
): void => {
  if (request.type === 'control_cancel_request') {
    runtime.held = runtime.held.filter((held) => held.pending.requestId !== request.request_id)
    runtime.syncStatus()
    runtime.applyPendingRestart()

    return void runtime.outbox.drain()
  }

  if (request.request?.subtype !== 'can_use_tool') {
    return process.write({
      type: 'control_response',
      response: { subtype: 'error', request_id: request.request_id, error: UNSUPPORTED_REQUEST },
    })
  }

  const held = holdRequest(request, runtime.meta.permissionMode)

  if (!held) {
    return process.respond(request.request_id, { behavior: 'deny', message: UNSUPPORTED_REQUEST })
  }

  runtime.held = [...runtime.held, held]
  runtime.syncStatus()
  // Вид вопроса и есть повод позвать: разрешение, выбор, план.
  runtime.host.onCall(runtime.meta.id, held.pending.kind)
}
