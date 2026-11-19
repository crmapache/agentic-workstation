import type { ParseKeys } from 'i18next'

import type { FindingOutcome } from './FindingsCard.types'

/** Блок кода `json` или без языка: метка языка - привычка CLI, а не обещание. */
export const FENCED = /```[a-zA-Z]*\s*\n([\s\S]*?)```/g

export const VERDICTS = new Set(['CONFIRMED', 'PLAUSIBLE'])

export const OUTCOMES = new Set(['fixed', 'skipped', 'no_change_needed'])

/** Чем кончилась находка после исправлений - единственное, что тут стоит цвета. */
export const OUTCOME_KEYS: Record<FindingOutcome, ParseKeys> = {
  fixed: 'agentPanel.agents.findings.fixed',
  skipped: 'agentPanel.agents.findings.skipped',
  no_change_needed: 'agentPanel.agents.findings.noChange',
}
