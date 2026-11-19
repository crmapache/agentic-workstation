import type { EngineAccounts } from '../../scenarios/engine/engine-core'
import type { CodexRunFacts } from './codex-run-process'

/** Аккаунты Codex с запасом: самое полное окно всего тарифа (проценты; null - не измерено). */
export const codexAccountRows = (facts: CodexRunFacts['desk']) =>
  facts.accounts.list.map((row) => {
    const windows = facts.usageOf(row.id)?.windows.filter((window) => !window.model) ?? []

    return {
      id: row.id,
      label: row.alias || row.email,
      fullest: windows.length > 0 ? Math.max(...windows.map((window) => window.percent)) : null,
    }
  })

/**
 * Аккаунты Codex для прогонов (выручка на лимите, engine-accounts.ts): выбор человека в панели
 * Codex, имена, запас окон каждого. Память отказов лимита - здесь: у панели Codex своей нет,
 * а прогоны одного сеанса IDE должны знать отказы друг друга, чтобы не стучаться в тот же
 * аккаунт. Двойников Codex не склеивает - «тот же» - это тот же id.
 */
export const codexRunAccounts = (facts: CodexRunFacts['desk']): EngineAccounts => {
  const refused = new Map<string, number>()

  return {
    current: () => facts.accounts.current,
    label: (id) => codexAccountRows(facts).find((row) => row.id === id)?.label ?? '',
    candidates: (_here, now) =>
      codexAccountRows(facts).map((row) => {
        const until = refused.get(row.id) ?? null

        return {
          id: row.id,
          refusedUntil: until !== null && until > now ? until : null,
          fullest: row.fullest,
          twinOfHere: false,
          runs: null,
        }
      }),
    same: (left, right) => left === right,
    noteRefused: (id, until) => refused.set(id, until),
  }
}
