import type { TFunction } from 'i18next'

import type { ClaudeAccount } from '@shared/claude-accounts'

/**
 * Имя аккаунта: данное человеком, иначе почта (её часть до @). Обычный вход без имени - «вход по
 * умолчанию» и с известной почтой: она стоит строкой под именем, а имя говорит, что это за вход.
 */
export const accountTitle = (account: ClaudeAccount, t: TFunction): string =>
  account.alias ||
  (account.id === ''
    ? t('claudeCode.accounts.defaultTitle')
    : account.email.split('@')[0] || t('claudeCode.accounts.untitled'))
