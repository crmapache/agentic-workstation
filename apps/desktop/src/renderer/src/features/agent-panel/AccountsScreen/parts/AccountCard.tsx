import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'

import type { AccountCardProps } from '../AccountsScreen.types'
import { accountTitle } from '../AccountsScreen.utils'
import { SettingsItem } from '../../SettingsItem/SettingsItem'
import { UsageWindows } from '../../UsageWindows/UsageWindows'

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
          {isCurrent && <Badge tone="accent">{t('agentPanel.accounts.current')}</Badge>}
          {account.signedIn === false && (
            <Badge tone="warning">{t('agentPanel.accounts.signedOut')}</Badge>
          )}
          {account.signedIn === true && (
            <Badge tone="success">{t('agentPanel.accounts.signedIn')}</Badge>
          )}
        </>
      }
      details={[
        [account.plan, account.email].filter(Boolean).join(' · '),
        account.external && t('agentPanel.accounts.fromAcc'),
      ]}
      actions={
        <>
          {!isCurrent && (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => onSelect(account)}>
              {t('agentPanel.accounts.use')}
            </Button>
          )}
          {account.signedIn !== true && (
            <Button size="sm" disabled={busy} onClick={() => onSignIn(account)}>
              {t('agentPanel.accounts.signIn')}
            </Button>
          )}
          {/* Обычный вход тоже называют (как в ACC): забыть его нельзя, а назвать - можно. */}
          <Button size="sm" disabled={busy} onClick={() => onRename(account)}>
            {t('agentPanel.accounts.rename')}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onForget(account)}>
            {account.id === '' ? t('agentPanel.accounts.logout') : t('agentPanel.accounts.forget')}
          </Button>
        </>
      }>
      {/* Отказ лимита - строкой «снова доступен» под лимитами, а не меткой в шапке: метка
          теснила имя, а срок и так стоит под полосами. */}
      {usage && <UsageWindows usage={usage} refusedUntil={refusedUntil} />}
    </SettingsItem>
  )
}
