import type { TFunction } from 'i18next'

import type { AccountUsage } from '@shared/account-usage'
import { TODAY_TOKENS_METER } from '@shared/panel-prefs'

import { meterKey, windowLabel } from '../usage.utils'
import type { MeterChoice } from './MetersScreen.types'

/**
 * Что можно спрятать под полем - то, что там стоит сейчас: кольца окон текущего аккаунта
 * в их порядке и токены за день, если провайдер их считает. Лимитов ещё нет - строка одна,
 * токены.
 */
export const meterChoices = (
  usage: AccountUsage | undefined,
  t: TFunction,
  todayTokens = true,
): MeterChoice[] => {
  const windows = usage?.windows ?? []
  const rings = windows
    .filter(
      (window, index) =>
        windows.findIndex((other) => meterKey(other) === meterKey(window)) === index,
    )
    .map((window) => ({
      key: meterKey(window),
      label: windowLabel(window, t),
      description: t('agentPanel.meters.ring'),
    }))

  return [
    ...rings,
    ...(todayTokens
      ? [
          {
            key: TODAY_TOKENS_METER,
            label: t('agentPanel.meters.tokens.label'),
            description: t('agentPanel.meters.tokens.sub'),
          },
        ]
      : []),
  ]
}

/** Отметка показания: спрятанное становится видно, видное - спрятанным. */
export const toggleMeter = (hidden: readonly string[], key: string): string[] =>
  hidden.includes(key) ? hidden.filter((other) => other !== key) : [...hidden, key]
