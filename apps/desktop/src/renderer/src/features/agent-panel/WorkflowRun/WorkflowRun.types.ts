import type { FleetAgent, ToolFeedItem, WorkflowFleet } from '@shared/conversation-feed'

export type WorkflowRunProps = {
  /** Вызов Workflow - карточка, которой принадлежит флот: им называют открытого агента. */
  tool: ToolFeedItem
  fleet: WorkflowFleet
}

export type FleetAgentLineProps = {
  agent: FleetAgent
  itemId: string
  /**
   * Прогон ещё идёт. Отчёт об этом молчит: это последнее, что прислал CLI, а убитый
   * процесс не прощается - «running» из отчёта правда только пока идёт сама задача.
   */
  live: boolean
  now: number
}
