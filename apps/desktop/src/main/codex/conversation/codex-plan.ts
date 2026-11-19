import type { RequestResponse } from '@shared/conversation'

import type { HeldRequest } from '../../agents/conversation/agent-parts'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'

/**
 * Чем одобренный план отдаётся Codex - словами его терминала: после «Implement» он сам
 * переключается из плана в работу и пишет это сообщение от человека.
 */
export const IMPLEMENT_PLAN = 'Implement the plan.'

/** План, который Codex предложил в конце хода: id его элемента в ленте и текст. */
export type ProposedPlan = { itemId: string; text: string }

/**
 * Вопрос «план готов - делать?». У Codex это не запрос сервера, как ExitPlanMode у Claude:
 * ход в режиме плана просто кончается элементом `plan`. Панель держит вопрос сама, пока
 * человек не решит, - очередь до решения не идёт (ядро держит её, пока есть вопросы).
 */
export const holdPlan = (requestId: string, plan: ProposedPlan): HeldRequest => ({
  pending: { kind: 'plan', requestId, toolUseId: plan.itemId, plan: plan.text },
  ownAfterTurn: true,
})

export const isPlanHeld = (held: HeldRequest): boolean => held.pending.kind === 'plan'

/**
 * Решение человека. Одобрил - режим работы (с «принимать правки» - «Авто», без - «Спрашивать»,
 * как у Claude) и «Implement the plan.» новым ходом. Отклонил с замечанием - замечание
 * следующим ходом, план дорабатывается в том же режиме; без замечания - ничего не уходит.
 */
export const decidePlan = (runtime: ConversationRuntime, response: RequestResponse): void => {
  if (response.kind !== 'plan') return

  if (response.approved) {
    runtime.setOptions({ permissionMode: response.acceptEdits ? 'acceptEdits' : 'default' })
    void runtime.send({ text: IMPLEMENT_PLAN, images: [] })

    return
  }

  const feedback = response.feedback.trim()

  if (feedback) void runtime.send({ text: feedback, images: [] })
}
