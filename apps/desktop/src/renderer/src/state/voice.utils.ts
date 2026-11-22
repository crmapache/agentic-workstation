import type { TFunction } from 'i18next'

import type { VoiceCallView } from '@shared/voice'

/**
 * Что звонок делает сейчас - словами для строки состояния и полосы звонка: «Listening»,
 * «Working: Bash». Общее у строки состояния и панели агента.
 */
export const callStateText = (t: TFunction, call: Pick<VoiceCallView, 'state' | 'tool'>): string =>
  call.state === 'working' && call.tool
    ? t('voice.state.workingTool', { tool: call.tool })
    : t(`voice.state.${call.state}`)
