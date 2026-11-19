import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AcpSignInStep as Step } from '@shared/accounts'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import { usePanelAccounts } from '../../panel-accounts.hooks'
import styles from './AcpSignIn.module.scss'

/**
 * Шаг входа агента ACP (ADR 0092): ссылка на страницу входа, код устройства, который вводят там
 * (Kimi), или поле для кода, который страница показала (Antigravity). Им пользуются и экран
 * аккаунта, и экран «войдите» вместо панели.
 */
export const AcpSignInStep = ({ step }: { step: Step }) => {
  const { t } = useTranslation()
  const panelAccounts = usePanelAccounts()
  const [code, setCode] = useState('')

  const handleSubmit = () => {
    void panelAccounts.submitCode(code)
    setCode('')
  }

  return (
    <div className={styles.step}>
      <a className={styles.link} href={step.url} target="_blank" rel="noreferrer">
        {t('agentPanel.accounts.acp.openPage')}
      </a>
      {step.userCode && (
        <>
          <span className={styles.hint}>{t('agentPanel.accounts.acp.enterCode')}</span>
          <span className={styles.code}>{step.userCode}</span>
        </>
      )}
      {step.needsCode && (
        <div className={styles.codeForm}>
          <TextField
            label={t('agentPanel.accounts.acp.pasteCode')}
            value={code}
            onChange={setCode}
          />
          <Button size="sm" variant="primary" onClick={handleSubmit} disabled={!code.trim()}>
            {t('agentPanel.accounts.acp.submit')}
          </Button>
        </div>
      )}
    </div>
  )
}
