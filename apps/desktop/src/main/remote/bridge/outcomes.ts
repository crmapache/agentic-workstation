import type { ScenarioCode } from '@shared/scenarios'

import type { RemoteErrorCode } from '@agentic-workstation/remote-protocol/agent-messages'

import type { Outcome } from './command-ledger'

/** Итоги команд телефона - одним видом для всех областей. */

export const done = (data?: unknown): Outcome =>
  data === undefined ? { ok: true } : { ok: true, data }

export const fail = (code: RemoteErrorCode, detail?: string): Outcome =>
  detail === undefined ? { ok: false, code } : { ok: false, code, detail }

/** Отказ сценариев - их кодом (queueBusy, untrusted, runOver…): у телефона есть на него слова. */
export const scenarioOutcome = (code: ScenarioCode | null): Outcome =>
  code ? fail('refused', code) : done()
