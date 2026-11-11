import type { RunSummary, ScenarioRun } from '@shared/scenario-runs'

/** Списки прогонов (runs.ts в ACC): что прошло и что можно подхватить. */

/** Прошлые - всё с диска, кроме идущих: живой список - единственная правда о том, что идёт. */
export const pastRuns = (runs: readonly RunSummary[], live: readonly RunSummary[]): RunSummary[] =>
  runs.filter((run) => !live.some((one) => one.id === run.id))

/** Подхватить можно остановленный или упавший прогон, чья голова поднималась. */
export const isResumable = (run: Pick<ScenarioRun, 'state' | 'headConversationId'>): boolean =>
  (run.state === 'stopped' || run.state === 'failed') && run.headConversationId.length > 0
