import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'

import type { RouteOf } from '../../../lib/route.types'
import { seenRunState } from '../../../lib/status.constants'
import { useCommand } from '../../../state/commands.hooks'
import { useWatch, useQueues } from '../../../state/remote.queries'

type QueueAction = CommandArgs<'scenarios.queue'>['action']

type RunAction = CommandArgs<'scenarios.control'>['action']

/** Очередь сценариев: подписка на очереди проекта и команды очереди и её идущего прогона. */
export const useQueueScreen = (route: RouteOf<'queue'>) => {
  const { agentId, projectKey, queueId } = route
  const message = useQueues(agentId, projectKey).data
  const act = useCommand(agentId, 'scenarios.queue')
  const control = useCommand(agentId, 'scenarios.control')
  const queue = message?.queues.find((one) => one.id === queueId)
  const run = message?.live.find((one) => one.queueId === queueId)

  useWatch(agentId, { kind: 'queues', scope: projectKey })

  return {
    message,
    queue,
    run,
    busy: act.isPending || control.isPending,
    queueAction: (action: QueueAction) => act.mutate({ queueId, action }),
    runAction: (shown: { id: string; state: string }, action: RunAction) =>
      control.mutate({ runId: shown.id, action, seen: seenRunState(shown.state) }),
  }
}
