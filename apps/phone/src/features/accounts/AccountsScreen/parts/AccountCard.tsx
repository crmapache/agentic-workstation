import { useTranslation } from 'react-i18next'

import type { AccountWire } from '@agentic-workstation/remote-protocol/machine-wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Card } from '@agentic-workstation/ui/Card'

import type { useAccountsScreen } from '../AccountsScreen.hooks'
import styles from '../AccountsScreen.module.scss'
import { accountName } from '../AccountsScreen.utils'
import { AccountActions } from './AccountActions'
import { UsageWindows } from './UsageWindows'

/** Аккаунт карточкой: имя, тариф, вошёл ли, текущий ли; под этим - лимиты и кнопки. */
export const AccountCard = ({
  account,
  screen,
}: {
  account: AccountWire
  screen: ReturnType<typeof useAccountsScreen>
}) => {
  const { t } = useTranslation()
  const facts = [
    account.plan,
    account.signedIn === true && t('accounts.signedIn'),
    account.signedIn === false && t('accounts.signedOut'),
  ]

  return (
    <Card
      title={accountName(t, account)}
      description={facts.filter(Boolean).join(' · ') || undefined}
      actions={account.current && <Badge tone="success">{t('accounts.current')}</Badge>}>
      <div className={styles.body}>
        <UsageWindows account={account} offset={screen.offset} />
        <AccountActions account={account} screen={screen} />
      </div>
    </Card>
  )
}
