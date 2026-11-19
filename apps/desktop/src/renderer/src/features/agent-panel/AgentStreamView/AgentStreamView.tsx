import { useMemo } from 'react'

import { selectedStreamOf } from '../agents.utils'
import { FeedScopeContext } from '../feed-scope.context'
import { useStreamsStore } from '../streams.store'
import { FleetAgentView } from '../FleetAgentView/FleetAgentView'
import styles from './AgentStreamView.module.scss'
import type { AgentStreamViewProps } from './AgentStreamView.types'
import { AgentStream } from './parts/AgentStream'

/**
 * На месте ленты, когда выбран не main: журнал агента, чей чип выбран, или окно агента
 * флота поверх него. Выбран main (или агента уже нет в ленте) - null, видна лента.
 */
export const AgentStreamView = ({ conversation, items }: AgentStreamViewProps) => {
  const selection = useStreamsStore((state) => state.byConversation[conversation.id])
  const selected = selectedStreamOf(selection, items)
  const scope = useMemo(
    () => ({ conversationId: conversation.id, projectPath: conversation.projectPath }),
    [conversation.id, conversation.projectPath],
  )

  if (!selected) return null

  return (
    <FeedScopeContext value={scope}>
      <div className={styles.agentStreamView}>
        {selected.kind === 'fleetAgent' ? (
          <FleetAgentView
            conversationId={conversation.id}
            itemId={selected.itemId}
            index={selected.index}
            items={items}
          />
        ) : (
          <AgentStream itemId={selected.itemId} items={items} />
        )}
      </div>
    </FeedScopeContext>
  )
}
