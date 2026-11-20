import type { TFunction } from 'i18next'

import type { AccountWire } from '@agentic-workstation/remote-protocol/machine-wire-types'

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
