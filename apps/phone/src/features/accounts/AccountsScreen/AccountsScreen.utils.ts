import type { TFunction } from 'i18next'

import type {
  AccountWire,
  UsageWindowWire,
} from '@agentic-workstation/remote-protocol/machine-wire-types'
import type { ProgressBarTone } from '@agentic-workstation/ui/ProgressBar.types'

/**
 * Имя аккаунта: своё имя, иначе почта, иначе - обычный вход Claude Code (пустой id) или
 * просто «аккаунт».
 */
export const accountName = (t: TFunction, account: AccountWire): string =>
  account.alias || account.email || t(account.id === '' ? 'accounts.default' : 'accounts.untitled')

/** Тариф словами: `max` от CLI - «Max plan», а не слово, которое читается как имя человека. */
export const planLabel = (t: TFunction, plan: string): string =>
  plan ? t(`accounts.plans.${plan}`, { defaultValue: t('accounts.plans.other', { plan }) }) : ''

/**
 * Строка под именем: почта (если имя своё - иначе почта уже в заголовке), тариф, вошёл ли.
 * Без почты аккаунты с одним тарифом не отличить: имена у них свои, а платят разные люди.
 */
export const accountFacts = (t: TFunction, account: AccountWire): string =>
  [
    account.alias && account.email,
    planLabel(t, account.plan),
    account.signedIn === true && t('accounts.signedIn'),
    account.signedIn === false && t('accounts.signedOut'),
  ]
    .filter(Boolean)
    .join(' · ')

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
