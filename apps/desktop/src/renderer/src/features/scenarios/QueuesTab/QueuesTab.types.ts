import type { RunSummary } from '@shared/scenario-runs'
import type { ProjectRef } from '@shared/workspace'

import type { QueueGroup } from '../scenarios-queues.utils'

export type OtherProjectsProps = {
  /** Проекты с очередями, кроме текущего, - в порядке queueGroups. */
  groups: readonly QueueGroup[]
  live: readonly RunSummary[]
  /** Недавние проекты: закрытый проект открывается заново только из них. */
  recent: readonly ProjectRef[]
}
