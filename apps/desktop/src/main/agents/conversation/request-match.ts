import type { RequestResponse } from '@shared/conversation'

import type { HeldRequest } from './agent-parts'

/** Ответ подходит к вопросу: тот же вид, а вопрос с вариантами можно снять отказом. */
export const matchesRequest = (held: HeldRequest, response: RequestResponse): boolean =>
  response.kind === held.pending.kind ||
  (held.pending.kind === 'question' &&
    response.kind === 'permission' &&
    response.decision.behavior === 'deny')
