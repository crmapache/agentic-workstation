import type { ScenarioWire } from '@agentic-workstation/remote-protocol/scenario-wire-types'

/**
 * Где черновик: форма описания (и чем кончилась прошлая попытка, если не вышла), модель пишет
 * (id черновика - по нему отмена) или сценарий написан и ждёт решения - сохранить или выбросить.
 */
export type DraftPhase =
  | { kind: 'form'; failure: string | null }
  | { kind: 'writing'; draftId: string; startedAt: number }
  | { kind: 'ready'; draftId: string; scenario: ScenarioWire }
