import type { RunSummary } from '@shared/scenario-runs'

import type { MomentWords } from '../scenarios-moments.utils'

export type PastRunsTableProps = {
  runs: readonly RunSummary[]
  /** Сколько строк раскрыто. */
  shown: number
  now: number
  onOpen: (runId: string) => void
  onStar: (run: RunSummary) => void
  onDelete: (run: RunSummary) => void
  onMore: () => void
  onFewer: () => void
}

export type PastRunRowProps = {
  run: RunSummary
  now: number
  words: MomentWords
  onOpen: (runId: string) => void
  onStar: (run: RunSummary) => void
  onDelete: (run: RunSummary) => void
}
