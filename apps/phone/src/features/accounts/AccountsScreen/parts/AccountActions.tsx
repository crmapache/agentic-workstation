import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AccountWire } from '@agentic-workstation/remote-protocol/machine-wire-types'
import { Button } from '@agentic-workstation/ui/Button'

import type { useAccountsScreen } from '../AccountsScreen.hooks'
import styles from '../AccountsScreen.module.scss'
import type { AccountAsk } from '../AccountsScreen.types'
import { accountName } from '../AccountsScreen.utils'
import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'
import { TextDialog } from '../../../../shell/TextDialog/TextDialog'

/**
 * Кнопки аккаунта. Выбрать - только вошедший и не текущий; забыть - только добавленный (обычный
 * вход не забывается); выйти - только из обычного входа. Всё, кроме имени, - с «точно?» и
 * последствием словами: выбор перезапускает разговоры, забытый вход вернёт только браузер на Mac.
 */
export const AccountActions = ({
  account,
  screen,
}: {
  account: AccountWire
  screen: ReturnType<typeof useAccountsScreen>
}) => {
  const { t } = useTranslation()
  const [asking, setAsking] = useState<AccountAsk>(null)
  const name = accountName(t, account)
  const canUse = !account.current && account.signedIn === true
  const canForget = account.id !== ''
  const canLogout = account.id === '' && account.signedIn === true

  const handleClose = () => setAsking(null)

  return (
    <div className={styles.actions}>
      {canUse && (
        <Button
          size="touch"
          variant="primary"
          disabled={screen.busy}
          onClick={() => setAsking('use')}>
          {t('accounts.use')}
        </Button>
      )}
      <Button size="touch" disabled={screen.busy} onClick={() => setAsking('rename')}>
        {t('accounts.rename')}
      </Button>
      {canForget && (
        <Button
          size="touch"
          variant="ghost"
          disabled={screen.busy}
          onClick={() => setAsking('forget')}>
          {t('accounts.forget')}
        </Button>
      )}
      {canLogout && (
        <Button
          size="touch"
          variant="ghost"
          disabled={screen.busy}
          onClick={() => setAsking('logout')}>
          {t('accounts.logout')}
        </Button>
      )}
      <ConfirmDialog
        open={asking === 'use'}
        title={t('accounts.useTitle', { name })}
        text={t('accounts.useText')}
        confirmLabel={t('accounts.use')}
        onConfirm={() => screen.handleUse(account.id)}
        onClose={handleClose}
      />
      <TextDialog
        key={asking === 'rename' ? account.alias : 'closed'}
        open={asking === 'rename'}
        title={t('accounts.renameTitle')}
        label={t('accounts.alias')}
        initial={account.alias}
        maxLength={80}
        onSave={(alias) => screen.handleRename(account.id, alias)}
        onClose={handleClose}
      />
      <ConfirmDialog
        open={asking === 'forget'}
        title={t('accounts.forgetTitle', { name })}
        text={t('accounts.forgetText')}
        confirmLabel={t('accounts.forget')}
        onConfirm={() => screen.handleForget(account.id)}
        onClose={handleClose}
      />
      <ConfirmDialog
        open={asking === 'logout'}
        title={t('accounts.logoutTitle')}
        text={t('accounts.logoutText')}
        confirmLabel={t('accounts.logout')}
        onConfirm={screen.handleLogout}
        onClose={handleClose}
      />
    </div>
  )
}
