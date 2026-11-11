import type { RunQuestionWire } from '@agentic-workstation/remote-protocol/wire-types'

import type { PreparedImage } from '../../../lib/images'
import type { RouteOf } from '../../../lib/route.types'
import { seenRunState } from '../../../lib/status.constants'
import { useCommand } from '../../../state/commands.hooks'
import { useRun, useWatch } from '../../../state/remote.queries'

/** Прогон сценария: подписка на него у IDE и команды прогона. */
export const useRunScreen = (route: RouteOf<'run'>) => {
  const { agentId, runId } = route
  const run = useRun(agentId, runId).data
  const control = useCommand(agentId, 'scenarios.control')
  const answer = useCommand(agentId, 'scenarios.answer')
  const tell = useCommand(agentId, 'scenarios.tell')
  const carryOn = useCommand(agentId, 'scenarios.carryOn')

  useWatch(agentId, { kind: 'run', runId })

  const handleTell = async (text: string, images: PreparedImage[]): Promise<boolean> => {
    try {
      await tell.mutateAsync({
        runId,
        text,
        ...(images.length > 0 && {
          images: images.map(({ mediaType, data }) => ({ mediaType, data })),
        }),
      })

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
