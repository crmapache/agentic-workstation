import type { PreparedImage } from '../../../lib/images'
import type { RouteOf } from '../../../lib/route.types'
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
    control: (action: 'pause' | 'resume' | 'stop') => control.mutate({ runId, action }),
    answer: (allow: boolean, text: string) => answer.mutate({ runId, allow, text }),
    carryOn: () => carryOn.mutate({ runId }),
    handleTell,
  }
}
