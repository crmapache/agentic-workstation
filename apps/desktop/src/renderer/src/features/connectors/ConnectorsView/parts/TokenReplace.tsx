import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../ConnectorsView.module.scss'
import { useConnectorActions } from '../../../../state/connectors.queries'

/**
 * Замена ключа своего MCP с входом по ключу: прежний не приняли или он сменился. Без неё
 * пришлось бы удалить коннектор и добавить заново - и потерять выбор инструментов.
 */
export const TokenReplace = ({ id }: { id: string }) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const [isOpen, setIsOpen] = useState(false)
  const [token, setToken] = useState('')
  const [hasFailed, setHasFailed] = useState(false)

  const handleSave = async () => {
    if (!token.trim()) return

    if (!(await actions.setToken(id, token))) {
      setHasFailed(true)

      return
    }

    setToken('')
    setHasFailed(false)
    setIsOpen(false)
  }

  // Enter сохраняет ключ, как кнопка рядом.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    void handleSave()
  }

  if (!isOpen) {
    return (
      <div className={styles.buttons}>
        <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => setIsOpen(true)}>
          {t('connectors.actions.replaceToken')}
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.form}>
      <TextField
        label={t('connectors.actions.tokenLabel')}
        type="password"
        value={token}
        autoFocus
        onChange={setToken}
        onKeyDown={handleKeyDown}
      />
      {hasFailed && <p className={styles.failure}>{t('connectors.actions.tokenFailed')}</p>}
      <div className={styles.buttons}>
        <Button size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
          {t('connectors.actions.cancel')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!token.trim()}
          onClick={() => void handleSave()}>
          {t('connectors.actions.saveToken')}
        </Button>
      </div>
    </div>
  )
}
