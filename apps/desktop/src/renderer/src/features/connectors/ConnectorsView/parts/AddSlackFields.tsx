import { useState } from 'react'
import { SquareArrowOutUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import { SLACK_STEPS, SLACK_APPS_URL } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { AddFormState } from '../ConnectorsView.types'
import { useConnectorActions } from '../../../../state/connectors.queries'

/**
 * Поля Slack: свой Slack app человека на одно рабочее пространство - MCP Slack пускает только
 * внутренние и опубликованные в каталоге приложения (ADR 0032). «Create Slack app» открывает
 * Slack с готовым описанием, остаются переключатель MCP и ключи. Почему так - в «?».
 */
export const AddSlackFields = ({ form }: { form: AddFormState }) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const [isOpenFailed, setIsOpenFailed] = useState(false)

  const handleCreate = async () => {
    setIsOpenFailed(!(await actions.createSlackApp()))
  }

  return (
    <>
      <ol className={styles.steps}>
        {SLACK_STEPS.map((step) => (
          <li key={step}>{t(`connectors.add.slack.steps.${step}`)}</li>
        ))}
      </ol>
      {isOpenFailed && <p className={styles.failure}>{t('connectors.add.slack.createFailed')}</p>}
      <div className={styles.buttons}>
        <Button size="sm" icon={SquareArrowOutUpRight} onClick={() => void handleCreate()}>
          {t('connectors.add.slack.create')}
        </Button>
        <a className={styles.link} href={SLACK_APPS_URL} target="_blank" rel="noreferrer">
          {t('connectors.add.slack.guide')}
        </a>
      </div>
      <TextField
        label={t('connectors.add.slack.clientId')}
        value={form.fields.clientId}
        onChange={form.set('clientId')}
        onKeyDown={form.handleKeyDown}
      />
      <TextField
        label={t('connectors.add.slack.clientSecret')}
        type="password"
        value={form.fields.clientSecret}
        onChange={form.set('clientSecret')}
        onKeyDown={form.handleKeyDown}
      />
    </>
  )
}
