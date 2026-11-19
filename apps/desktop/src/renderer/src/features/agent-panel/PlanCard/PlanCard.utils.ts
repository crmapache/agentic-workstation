import { CODE_FENCE, TOP_LEVEL_STEP } from './PlanCard.constants'

/**
 * Сколько шагов в плане - пункты списка верхнего уровня, как их считает глаз (ACC):
 * вложенные пояснения шагами не звучат, строки в блоках кода - тоже.
 */
export const planSteps = (plan: string): number => {
  let inCode = false
  let steps = 0

  for (const line of plan.split('\n')) {
    if (CODE_FENCE.test(line.trim())) inCode = !inCode
    else if (!inCode && TOP_LEVEL_STEP.test(line)) steps += 1
  }

  return steps
}
