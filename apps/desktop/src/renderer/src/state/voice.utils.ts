import type { TFunction } from 'i18next'

import type { VoiceCallView, VoiceCallState } from '@shared/voice'

/** Звонок в этих состояниях молчит сам: «Стоп» останавливать нечего, если агент не работает. */
const QUIET: readonly VoiceCallState[] = ['listening', 'connecting', 'paused']

/**
 * Что звонок делает сейчас - словами для строки состояния и полосы звонка: «Listening»,
 * «Working: Bash». Общее у строки состояния и панели агента.
 */
export const callStateText = (t: TFunction, call: Pick<VoiceCallView, 'state' | 'tool'>): string =>
  call.state === 'working' && call.tool
    ? t('voice.state.workingTool', { tool: call.tool })
    : t(`voice.state.${call.state}`)

/**
 * Есть ли что останавливать кнопкой «Стоп»: звонок говорит, агент думает или работает. Иначе
 * кнопка гаснет - нажатие без следствия выглядело бы сломанным.
 */
export const canStopCall = (call: Pick<VoiceCallView, 'state' | 'agentBusy'>): boolean =>
  call.agentBusy || !QUIET.includes(call.state)
