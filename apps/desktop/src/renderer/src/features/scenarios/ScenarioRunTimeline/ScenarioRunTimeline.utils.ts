import type { RunStep, StepState } from '@shared/scenario-runs'
import { isStepBegun } from '@shared/scenario-runs'

import { GOING_STATES } from './ScenarioRunTimeline.constants'
import type { StepTone } from './ScenarioRunTimeline.types'

/** Ход шага открыт: он говорит сейчас, и строка показывает его новейшие слова. */
export const isGoing = (state: StepState): boolean => GOING_STATES.includes(state)

/** Тон точки на рельсе: смысл тот же, что у плашки состояния. */
export const stepToneOf = (state: StepState): StepTone => {
  if (!isStepBegun(state)) return 'ahead'
  if (state === 'asking') return 'asking'
  if (isGoing(state)) return 'going'
  if (state === 'done' || state === 'failed') return state

  return 'paused'
}

/**
 * Строка карточки - одна, и какая, зависит от того, что есть: пока ход открыт - что агент
 * говорит сейчас (отличие думающей карточки от зависшей), кончился - чем кончил, до того -
 * что ей велели. У строки впереди её нет вовсе.
 */
export const stepLineOf = (
  step: Pick<RunStep, 'state' | 'said' | 'summary' | 'prompt'>,
): string => {
  if (!isStepBegun(step.state)) return ''
  if (isGoing(step.state) && step.said.trim()) return step.said

  return step.summary.trim() ? step.summary : step.prompt
}
