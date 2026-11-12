import type { SpinnerTone } from '@agentic-workstation/ui/Spinner.types'

import type { RoadMood } from './ScenarioRoadmap.types'

/** Галочка и крестик в кружке остановки - мельче подписи, кружок ростом с маленький контрол. */
export const STOP_ICON_SIZE = 10

/** Остановка-заглушка, если раскладка назвала номер за краем (не бывает, но тип требует). */
export const NO_STOP = { state: 'waiting', stage: 0, pass: 1, title: '' } as const

/**
 * Тон кольца работы у текущей остановки - тот же, что у полосы этапа: работает сам - жёлтым,
 * ждёт человека - оранжевым. Пауза и конец стоят на месте: кольца нет.
 */
export const RING_TONES: Partial<Record<RoadMood, SpinnerTone>> = {
  working: 'warning',
  asking: 'accent',
}
