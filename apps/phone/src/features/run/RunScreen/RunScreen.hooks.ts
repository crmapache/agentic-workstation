import type { RunWire, RunQuestionWire } from '@agentic-workstation/remote-protocol/wire-types'

import type { OutgoingMessage } from '../../../lib/attachments'
import { attachmentArgs } from '../../../lib/attachments'
import { useNow } from '../../../lib/now.hooks'
import type { RouteOf } from '../../../lib/route.types'
import { isRunOver, seenRunState } from '../../../lib/status.constants'
import { useCommand } from '../../../state/commands.hooks'
import { useRun, useWatch, useInventory } from '../../../state/remote.queries'

/** Прогон сценария: подписка на него у IDE и команды прогона. */
export const useRunScreen = (route: RouteOf<'run'>) => {
  const { agentId, runId } = route
  const run = useRun(agentId, runId).data
  const control = useCommand(agentId, 'scenarios.control')
  const answer = useCommand(agentId, 'scenarios.answer')
  const tell = useCommand(agentId, 'scenarios.tell')
  const carryOn = useCommand(agentId, 'scenarios.carryOn')

  useWatch(agentId, { kind: 'run', runId })

  const handleTell = async (message: OutgoingMessage): Promise<boolean> => {
    try {
      await tell.mutateAsync({ runId, text: message.text, ...attachmentArgs(message) })

      return true
    } catch {
      return false
    }
  }

  return {
    run,
    busy: control.isPending || answer.isPending || carryOn.isPending,
    // Кнопка - для того состояния, что на экране; ответ - тому вопросу, что на экране.
    control: (action: 'pause' | 'resume' | 'stop') =>
      control.mutate({ runId, action, seen: seenRunState(run?.state ?? '') }),
    answer: (question: RunQuestionWire, allow: boolean, text: string) =>
      answer.mutate({
        runId,
        question: { stepKey: question.stepKey, askedAt: question.askedAt },
        allow,
        text,
      }),
    carryOn: () => carryOn.mutate({ runId }),
    handleTell,
  }
}

/**
 * Часы IDE для прогона: сейчас по часам телефона с поправкой на часы IDE (времена прогона - её),
 * раз в секунду, пока прогон идёт, и раз в минуту после. offset - насколько часы IDE впереди.
 */
export const useRunClock = (agentId: string, run: RunWire | null | undefined) => {
  const inventory = useInventory(agentId).data
  const now = useNow(run && !isRunOver(run.state) ? 1000 : 60_000)
  const offset = inventory ? inventory.at - inventory.receivedAt : 0

  return { now: now + offset, offset }
}
