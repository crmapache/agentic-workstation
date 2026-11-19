import { useMemo } from 'react'

import type { ToolFeedItem } from '@shared/conversation-feed'

import { useStickToEnd } from '../AgentStreamView.hooks'
import styles from '../AgentStreamView.module.scss'
import type { AgentStreamProps } from '../AgentStreamView.types'
import { AgentLog } from '../../AgentLog/AgentLog'

/**
 * Поток одного агента: его журнал тем же компонентом, что в карточке, на всю высоту.
 * Без шапки и процентов - кто это и сколько идёт, говорит выбранный чип над лентой.
 */
export const AgentStream = ({ itemId, items }: AgentStreamProps) => {
  const tool = items.find(
    (item): item is ToolFeedItem => item.kind === 'tool' && item.id === itemId,
  )
  const steps = useMemo(
    () => items.filter((item) => item.parentToolUseId === itemId),
    [items, itemId],
  )
  const ref = useStickToEnd(`${steps.length}:${tool?.task?.steps.length}:${tool?.status}`)

  if (!tool) return null

  return (
    <div ref={ref} className={styles.stream}>
      <AgentLog tool={tool} steps={steps} />
    </div>
  )
}
