import type { StatsTokens, StatsTotals } from '@shared/statistics'

/** Все токены группы: вход, выход, чтение и запись кеша. */
export const tokensOf = (tokens: StatsTokens): number =>
  tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite

/**
 * Строки периода: «изменено» - добавленные и удалённые вместе, у человека и у агентов.
 * Код руками и код агентов складываются в одно «сколько кода сдвинулось».
 */
export const linesOf = (totals: StatsTotals): { you: number; agents: number; total: number } => {
  const you = totals.manualLinesAdded + totals.manualLinesRemoved
  const agents = totals.agentLinesAdded + totals.agentLinesRemoved

  return { you, agents, total: you + agents }
}
