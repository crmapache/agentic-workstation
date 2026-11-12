import { RefreshCw, UserRoundX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import type { RouteOf } from '../../../lib/route.types'
import { failureText } from '../../../state/commands.utils'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { Screen } from '../../../shell/Screen/Screen'
import { useAccountsScreen } from './AccountsScreen.hooks'
import styles from './AccountsScreen.module.scss'
import { AccountCard } from './parts/AccountCard'

/**
 * Аккаунты Claude на машине: чья подписка платит, сколько осталось в каждом окне лимита, выбрать
 * другой вошедший. Войти в новый - за Mac (нужен браузер). Цифры лимитов - по кнопке «обновить».
 */
export const AccountsScreen = ({ route }: { route: RouteOf<'accounts'> }) => {
  const { t } = useTranslation()
  const screen = useAccountsScreen(route)
  const { accounts } = screen

  return (
    <Screen
      title={t('accounts.title')}
      subtitle={screen.machine}
      agentId={route.agentId}
      help={{ title: t('accounts.help.title'), text: t('accounts.help.text') }}
      actions={
        <IconButton
          icon={RefreshCw}
          size="touch"
          label={t('accounts.refresh')}
          disabled={accounts.isFetching}
          onClick={() => void accounts.refetch()}
        />
      }>
      {accounts.isPending && <LinkWait agentId={route.agentId} label={t('accounts.loading')} />}
      {accounts.isError && (
        <div className={styles.failed}>
          <p className={styles.error}>{failureText(t, accounts.error)}</p>
          <Button size="touch" onClick={() => void accounts.refetch()}>
            {t('history.retry')}
          </Button>
        </div>
      )}
      {accounts.data?.accounts.length === 0 && (
        <EmptyState icon={UserRoundX} title={t('accounts.none')} />
      )}
      {accounts.data?.accounts.map((account) => (
        <AccountCard key={account.id || 'default'} account={account} screen={screen} />
      ))}
    </Screen>
  )
}
