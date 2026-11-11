import type { ScenarioRun } from '@shared/scenario-runs'
import type { RunPlace } from '@shared/ipc/scenarios.contract'

export type ScenarioTellFieldProps = {
  place: RunPlace
  run: Pick<ScenarioRun, 'id' | 'state'>
}
