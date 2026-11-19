import type { FastReport } from '@shared/panel-extras'

import type { CliMessage } from '../cli/cli-messages'
import { stringField } from '../cli/cli-messages'

/**
 * Быстрый режим: просьба - `fastMode` в слое flag settings заявкой `apply_flag_settings`
 * (без неё CLI под потоком отвечает `sdk_opt_in_required`), а работает ли режим - CLI
 * пишет сам в `system/init` и `result` каждого хода (замер ACC на 2.1.293).
 */

const STATES: readonly FastReport['state'][] = ['on', 'off', 'cooldown']

/** Что CLI сказал о быстром режиме в этой строке; null - ничего не сказал. */
export const fastReportOf = (message: CliMessage): FastReport | null => {
  const state = STATES.find((option) => option === stringField(message, 'fast_mode_state'))

  return state ? { state, reason: stringField(message, 'fast_mode_disabled_reason') } : null
}

/** Заявка CLI: попросить быстрый режим или снять просьбу. */
export const fastModeRequest = (on: boolean) => ({
  subtype: 'apply_flag_settings',
  settings: { fastMode: on },
})
