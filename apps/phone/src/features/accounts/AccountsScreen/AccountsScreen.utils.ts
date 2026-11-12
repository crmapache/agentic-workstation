import type { TFunction } from 'i18next'

import type {
  AccountWire,
  UsageWindowWire,
} from '@agentic-workstation/remote-protocol/machine-wire-types'
import type { ProgressBarTone } from '@agentic-workstation/ui/ProgressBar.types'

/**
 * Имя аккаунта: своё имя, иначе почта (замаскированная IDE), иначе - обычный вход Claude Code
 * (пустой id) или просто «аккаунт».
 */
export const accountName = (t: TFunction, account: AccountWire): string =>
  account.alias || account.email || t(account.id === '' ? 'accounts.default' : 'accounts.untitled')

/** Окно лимита словами: пять часов, неделя, неделя одной модели. */
export const windowLabel = (t: TFunction, window: UsageWindowWire): string => {
  if (window.model) return t('accounts.windows.weeklyModel', { model: window.model })

  return t(`accounts.windows.${window.group}`, { defaultValue: window.group })
}

/** Сколько израсходовано, целыми процентами; больше 100 - доплата, так и показывается. */
export const percentText = (percent: number): string => `${Math.round(Math.max(0, percent))}%`

/** Доля полосы: до края, даже если доплата ушла за сотню. */
export const usageShare = (percent: number): number => Math.min(Math.max(percent / 100, 0), 1)

/** Тон полосы по израсходованному: в запасе, быстрее нормы, близко к пределу, предел. */
export const usageTone = (percent: number): ProgressBarTone => {
  if (percent >= 100) return 'danger'
  if (percent >= 80) return 'high'
  if (percent >= 50) return 'warning'

  return 'success'
}
