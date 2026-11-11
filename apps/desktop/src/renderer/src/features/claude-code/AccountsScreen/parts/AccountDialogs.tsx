import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { TextField } from '@agentic-workstation/ui/TextField'

import type { AccountDialogsProps } from '../AccountsScreen.types'
import { accountTitle } from '../AccountsScreen.utils'

/**
 * Вопросы экрана аккаунтов: «забыть» (своё хранилище удаляется, чужое из ACC - нет),
 * «выйти» (отзывает вход на всех машинах) и новое имя аккаунта.
 */
export const AccountDialogs = ({
  confirm,
  renaming,
  onConfirm,
  onCloseConfirm,
  onRename,
  onCloseRename,
}: AccountDialogsProps) => {
  const { t } = useTranslation()
  const [alias, setAlias] = useState(renaming?.alias ?? '')
  const confirmText = !confirm
    ? ''
    : confirm.kind === 'logout'
      ? t('claudeCode.accounts.logoutText')
      : confirm.account.external
        ? t('claudeCode.accounts.forgetExternalText')
        : t('claudeCode.accounts.forgetText')

  return (
    <>
      <Dialog
        open={confirm !== null}
        title={
          confirm?.kind === 'logout'
            ? t('claudeCode.accounts.logoutTitle')
            : t('claudeCode.accounts.forgetTitle', {
                name: confirm ? accountTitle(confirm.account, t) : '',
              })
        }
        onSubmit={onConfirm}
        onClose={onCloseConfirm}
        actions={
          <>
            <Button type="button" onClick={onCloseConfirm}>
              {t('claudeCode.accounts.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {confirm?.kind === 'logout'
                ? t('claudeCode.accounts.logout')
                : t('claudeCode.accounts.forget')}
            </Button>
          </>
        }>
        {confirmText}
      </Dialog>
      <Dialog
        open={renaming !== null}
        title={t('claudeCode.accounts.renameTitle')}
        onSubmit={() => onRename(alias)}
        onClose={onCloseRename}
        actions={
          <>
            <Button type="button" onClick={onCloseRename}>
              {t('claudeCode.accounts.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('claudeCode.accounts.save')}
            </Button>
          </>
        }>
        <TextField
          label={t('claudeCode.accounts.alias')}
          value={alias}
          autoFocus
          onChange={setAlias}
        />
      </Dialog>
    </>
  )
}
