import type { RunState, StepState } from '@shared/scenario-runs'

/** Состояние прогона или шага: у них разные слова для одного состояния. */
export type ScenarioStatePillProps =
  | {
      of: 'run'
      state: RunState
      /** Прогон стоит на лимите - пауза не человека. */
      limited?: boolean | undefined
    }
  | { of: 'step'; state: StepState; limited?: undefined }
