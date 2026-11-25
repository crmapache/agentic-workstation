import type { TrackerTask, TrackerGroup } from '@shared/tracker'

export type GroupColumnProps = { group: TrackerGroup; flowId: string }

export type GroupBodyProps = { group: TrackerGroup }

export type TaskRowProps = { task: TrackerTask; groupId: string }
