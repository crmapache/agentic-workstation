import type { TFunction } from 'i18next'

import type { VoiceCallWire } from '@agentic-workstation/remote-protocol/agent-messages'

/** Что звонок делает сейчас - словами полосы звонка: «Listening», «Working: Bash». */
export const callStateText = (t: TFunction, call: Pick<VoiceCallWire, 'state' | 'tool'>): string =>
  call.state === 'working' && call.tool
    ? t('voice.state.workingTool', { tool: call.tool })
    : t(`voice.state.${call.state}`)
