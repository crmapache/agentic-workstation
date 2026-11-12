import type { TFunction } from 'i18next'

import { TODAY_TOKENS_METER } from '@shared/claude-prefs'
import type { AccountUsage } from '@shared/claude-usage'

import { meterKey, windowLabel } from '../usage.utils'
import type { MeterChoice } from './MetersScreen.types'

/**
 * Что можно спрятать под полем - то, что там стоит сейчас: кольца окон текущего аккаунта
 * в их порядке и токены за день. Лимитов ещё нет - строка одна, токены.
 */
export const meterChoices = (usage: AccountUsage | undefined, t: TFunction): MeterChoice[] => {
  const windows = usage?.windows ?? []
  const rings = windows
    .filter(
      (window, index) =>
        windows.findIndex((other) => meterKey(other) === meterKey(window)) === index,
    )
    .map((window) => ({
      key: meterKey(window),
      label: windowLabel(window, t),
      description: t('claudeCode.meters.ring'),
    }))

  return [
    ...rings,
    {
      key: TODAY_TOKENS_METER,
      label: t('claudeCode.meters.tokens.label'),
      description: t('claudeCode.meters.tokens.sub'),
    },
  ]
}

/** Отметка показания: спрятанное становится видно, видное - спрятанным. */
export const toggleMeter = (hidden: readonly string[], key: string): string[] =>
  hidden.includes(key) ? hidden.filter((other) => other !== key) : [...hidden, key]
