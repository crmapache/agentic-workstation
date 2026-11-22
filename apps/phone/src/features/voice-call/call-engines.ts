import type { PhoneCallEngine } from './phone-call-engine'

/**
 * Звук звонков страницы по IDE: движок готовит кнопка (в нажатии), подключает и гасит хост
 * звонков (VoiceCallHost), кнопки полосы звонка глушат микрофон. Один звонок на IDE.
 */
export const callEngines = new Map<string, PhoneCallEngine>()

/** Погасить звук звонка этой IDE: звонок кончился, отказан или не поднялся. */
export const dropEngine = (agentId: string): void => {
  callEngines.get(agentId)?.stop()
  callEngines.delete(agentId)
}
