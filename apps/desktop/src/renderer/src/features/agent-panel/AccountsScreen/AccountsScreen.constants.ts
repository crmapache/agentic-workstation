import type { ParseKeys } from 'i18next'

import type { AccountOutcome } from '@shared/accounts'
import type { AccountCapability } from '@shared/panel-extras'

/** Чем кончилось действие со входом - словами и тоном под шапкой. */
export const OUTCOME_VIEWS: Record<AccountOutcome, { tone: 'info' | 'danger'; key: ParseKeys }> = {
  landed: { tone: 'info', key: 'agentPanel.accounts.landed' },
  timeout: { tone: 'danger', key: 'agentPanel.accounts.timeout' },
  twin: { tone: 'danger', key: 'agentPanel.accounts.twin' },
  cancelled: { tone: 'info', key: 'agentPanel.accounts.cancelled' },
  'open-failed': { tone: 'danger', key: 'agentPanel.accounts.openFailed' },
  'logout-failed': { tone: 'danger', key: 'agentPanel.accounts.logoutFailed' },
  'design-no-account': { tone: 'danger', key: 'agentPanel.accounts.designNoAccount' },
}

/**
 * Ответы пробы, при которых второй аккаунт здесь не завести, и почему - словами: CLI не
 * слушает переменную хранилища, нет ни одного входа, вход по ключу API перебивает любой.
 */
export const UNAVAILABLE_KEYS: Partial<Record<AccountCapability, ParseKeys>> = {
  ignored: 'agentPanel.accounts.unavailable.ignored',
  not_signed_in: 'agentPanel.accounts.unavailable.notSignedIn',
  api_key: 'agentPanel.accounts.unavailable.apiKey',
}
