import type { ClaudeService } from '../../claude/claude-service'
import { environmentFor } from '../../claude/accounts/account-env'
import type { Environment } from '../../claude/cli/shell-env'
import type { EngineAccounts } from '../../scenarios/engine/engine-core'

/** Самое полное окно всего тарифа (пять часов, неделя), проценты; null - не измерен. */
const fullestOf = (claude: ClaudeService, id: string): number | null => {
  const windows = claude.usage.view[id]?.windows.filter((window) => !window.model) ?? []

  return windows.length > 0 ? Math.max(...windows.map((window) => window.percent)) : null
}

/**
 * Аккаунты для прогонов - из аккаунтов панели (main/claude/accounts, usage): выбор человека,
 * имена для заметок, запас каждого и общая с вкладками память отказов лимита. Двойники
 * одного входа панель склеивает сама (account-upkeep), поэтому «тот же» - это тот же id.
 */
export const scenarioAccounts = (claude: ClaudeService): EngineAccounts => {
  const rows = () => claude.accounts.view.accounts
  const same = (left: string, right: string) => left === right

  return {
    current: () => claude.accounts.current,
    label: (id) => {
      const row = rows().find((one) => one.id === id)

      return row?.alias || row?.email || ''
    },
    candidates: (here) => {
      const refused = claude.panel.accountFacts().refusedUntil ?? {}

      // Вышедшие из входа не кандидаты: процесс на них не поднимется.
      return rows()
        .filter((row) => row.signedIn !== false)
        .map((row) => ({
          id: row.id,
          refusedUntil: refused[row.id] ?? null,
          fullest: fullestOf(claude, row.id),
          twinOfHere: row.id !== here && same(row.id, here),
          runs: null,
        }))
    },
    same,
    noteRefused: (id, until) => claude.panel.noteRefusal(id, until),
  }
}

/** Окружение CLI аккаунта прогона; null - такого аккаунта больше нет. */
export const scenarioEnv = (
  claude: ClaudeService,
  accountId: string,
  base: Environment,
): Environment | null => {
  const drawer = claude.accounts.drawerFor(accountId)

  return drawer === undefined ? null : environmentFor(base, drawer)
}
