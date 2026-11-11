import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'

import type { AccountCardProps } from '../AccountsScreen.types'
import { accountTitle } from '../AccountsScreen.utils'
import { SettingsItem } from '../../SettingsItem/SettingsItem'
import { UsageWindows } from '../../UsageWindows/UsageWindows'
import { formatClock } from '../../UserMessage/UserMessage.utils'

/**
 * Аккаунт: имя, тариф и почта, вошёл ли CLI, его лимиты. Выбранный помечен, у
 * остальных - «использовать». Обычный вход Claude Code забыть нельзя - из него можно
 * только выйти; назвать - можно, как любой.
 */
export const AccountCard = ({
  account,
  usage,
  refusedUntil,
  isCurrent,
  busy,
  onSelect,
  onSignIn,
  onRename,
  onForget,
}: AccountCardProps) => {
  const { t } = useTranslation()

  return (
    <SettingsItem
      title={accountTitle(account, t)}
      selected={isCurrent}
      badges={
        <>
          {isCurrent && <Badge tone="accent">{t('claudeCode.accounts.current')}</Badge>}
          {account.signedIn === false && (
            <Badge tone="warning">{t('claudeCode.accounts.signedOut')}</Badge>
          )}
          {account.signedIn === true && (
            <Badge tone="success">{t('claudeCode.accounts.signedIn')}</Badge>
          )}
          {/* Лимит отказал аккаунту до сброса (прошедшие главный процесс снимает сам). */}
          {refusedUntil !== undefined && (
            <Badge tone="warning">
              {t('claudeCode.accounts.refusedUntil', { clock: formatClock(refusedUntil) })}
            </Badge>
          )}
        </>
      }
      details={[
        [account.plan, account.email].filter(Boolean).join(' · '),
        account.external && t('claudeCode.accounts.fromAcc'),
      ]}
      actions={
        <>
          {!isCurrent && (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => onSelect(account)}>
              {t('claudeCode.accounts.use')}
            </Button>
          )}
          {account.signedIn !== true && (
            <Button size="sm" disabled={busy} onClick={() => onSignIn(account)}>
              {t('claudeCode.accounts.signIn')}
            </Button>
          )}
          {/* Обычный вход тоже называют (как в ACC): забыть его нельзя, а назвать - можно. */}
          <Button size="sm" disabled={busy} onClick={() => onRename(account)}>
            {t('claudeCode.accounts.rename')}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onForget(account)}>
            {account.id === '' ? t('claudeCode.accounts.logout') : t('claudeCode.accounts.forget')}
          </Button>
        </>
      }>
      {usage && <UsageWindows usage={usage} />}
    </SettingsItem>
  )
}
