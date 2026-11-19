import { memo } from 'react'

import type { FeedRowViewProps } from '../Feed.types'
import { sameRow } from '../../feed-rows.utils'
import { AgentCard } from '../../AgentCard/AgentCard'
import { AssistantMessage } from '../../AssistantMessage/AssistantMessage'
import { EditCard } from '../../EditCard/EditCard'
import { NoticeRow } from '../../NoticeRow/NoticeRow'
import { PlanCard } from '../../PlanCard/PlanCard'
import { QuestionCard } from '../../QuestionCard/QuestionCard'
import { ShellCard } from '../../ShellCard/ShellCard'
import { ThinkingRow } from '../../ThinkingRow/ThinkingRow'
import { ToolGroup } from '../../ToolGroup/ToolGroup'
import { TurnSummary } from '../../TurnSummary/TurnSummary'
import { UserMessage } from '../../UserMessage/UserMessage'

/**
 * Строка ленты - в свой компонент по виду. Перерисовывается, только когда поменялись
 * её элементы: во время потока меняется одна последняя строка, а не вся лента.
 */
export const FeedRowView = memo(
  ({ row }: FeedRowViewProps) => {
    switch (row.kind) {
      case 'user':
        return <UserMessage item={row.item} />
      case 'assistant':
        return <AssistantMessage item={row.item} />
      case 'think':
        return <ThinkingRow items={row.items} />
      case 'tools':
        return <ToolGroup items={row.items} />
      case 'edit':
        return <EditCard tool={row.item} />
      case 'agent':
        return <AgentCard tool={row.item} steps={row.children} />
      case 'plan':
        return <PlanCard tool={row.item} />
      case 'question':
        return <QuestionCard tool={row.item} />
      case 'turn':
        return <TurnSummary item={row.item} />
      case 'shell':
        return <ShellCard item={row.item} />
      default:
        return <NoticeRow item={row.item} />
    }
  },
  (previous, next) => sameRow(previous.row, next.row),
)

FeedRowView.displayName = 'FeedRowView'
