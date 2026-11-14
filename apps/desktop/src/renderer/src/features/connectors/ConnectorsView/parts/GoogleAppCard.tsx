import { useState } from 'react'
import { Trash2, FileJson, KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { AgentApp, GoogleAppError, GoogleAppState } from '@shared/connectors'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'

import { GOOGLE_STEPS, GOOGLE_CONSOLE_URL } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import { useConnectorActions } from '../../../../state/connectors.queries'
import { ConnectorsHelp } from './ConnectorsHelp'
import { GoogleSetupMenu } from './GoogleSetupMenu'

/**
 * Свой клиент OAuth Google: через него входят все Gmail и Calendar. Не настроен - шаги,
 * как его создать, выбор скачанного файла и меню «Set up with AI»: шаги в браузере за
 * человека сделает Claude или Codex. Настроен - конец идентификатора, замена и удаление. Что
 * это за файл - в «?». Отмена выбора файла - не ошибка, о ней не говорим.
 */
export const GoogleAppCard = ({ google }: { google: GoogleAppState }) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const [error, setError] = useState<GoogleAppError | null>(null)
  const [agentFailure, setAgentFailure] = useState<AgentApp | null>(null)

  const handleImport = async () => {
    const failure = await actions.importGoogleApp()

    setError(failure === 'cancelled' ? null : failure)
  }

  return (
    <Card
      title={t('connectors.google.title')}
      icon={KeyRound}
      help={<ConnectorsHelp topic="google" />}
      description={
        google.configured && google.clientHint
          ? t('connectors.google.client', { hint: google.clientHint })
          : undefined
      }
      actions={
        <Badge tone={google.configured ? 'success' : 'warning'}>
          {t(google.configured ? 'connectors.google.ready' : 'connectors.google.missing')}
        </Badge>
      }>
      <div className={styles.cardBody}>
        {!google.configured && (
          <ol className={styles.steps}>
            {GOOGLE_STEPS.map((step) => (
              <li key={step}>{t(`connectors.google.steps.${step}`)}</li>
            ))}
          </ol>
        )}
        {error && error !== 'cancelled' && (
          <p className={styles.failure}>{t(`connectors.google.errors.${error}`)}</p>
        )}
        {agentFailure && !google.configured && (
          <p className={styles.failure}>
            {t('connectors.google.agentFailed', {
              app: t(`connectors.agentApps.${agentFailure}`),
            })}
          </p>
        )}
        <div className={styles.buttons}>
          <Button
            size="sm"
            icon={FileJson}
            variant={google.configured ? 'secondary' : 'primary'}
            onClick={() => void handleImport()}>
            {t(google.configured ? 'connectors.google.replace' : 'connectors.google.import')}
          </Button>
          {google.configured && (
            <Button size="sm" variant="danger" icon={Trash2} onClick={actions.forgetGoogleApp}>
              {t('connectors.google.forget')}
            </Button>
          )}
          {!google.configured && <GoogleSetupMenu onOpenFailed={setAgentFailure} />}
          {!google.configured && (
            <a className={styles.link} href={GOOGLE_CONSOLE_URL} target="_blank" rel="noreferrer">
              {t('connectors.google.console')}
            </a>
          )}
        </div>
      </div>
    </Card>
  )
}
