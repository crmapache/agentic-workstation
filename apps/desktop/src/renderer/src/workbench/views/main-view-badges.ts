import type { MainViewId } from '../../state/layout.types'
import { askingCount, useScenarioQueues } from '../../state/scenarios.queries'

/**
 * Числа на иконках видов середины - то, что ждёт человека: прогоны сценариев с вопросом или
 * вставшие на ответе. Видно, даже когда открыт другой вид (ADR 0039).
 */
export const useMainViewBadges = (): Partial<Record<MainViewId, number>> => {
  const { data } = useScenarioQueues()

  return { scenarios: askingCount(data) }
}
