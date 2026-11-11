import { Plus, LogIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useAddConnectorForm } from '../ConnectorsView.hooks'
import styles from '../ConnectorsView.module.scss'
import type { AddConnectorFormProps } from '../ConnectorsView.types'
import { signsInWithBrowser } from '../ConnectorsView.utils'
import { AddCommandFields } from './AddCommandFields'
import { AddMcpFields } from './AddMcpFields'
import { AddPlaywrightFields } from './AddPlaywrightFields'
import { AddSlackFields } from './AddSlackFields'
import { TypeNameFields } from './TypeNameFields'

/**
 * Форма нового коннектора одного типа: у встроенного - подпись (Work, Personal), у своего
 * MCP и команды - имя своего типа и «несколько раз» (ADR 0034); дальше то, что нужно типу -
 * Slack app, адрес и вход своего MCP, команда. Gmail и Calendar без клиента Google не
 * добавляются: войти им было бы нечем.
 */
export const AddConnectorForm = ({
  kind,
  googleReady,
  onAdded,
  onCancel,
}: AddConnectorFormProps) => {
  const { t } = useTranslation()
  const form = useAddConnectorForm(kind, onAdded)
  const needsGoogle = (kind === 'gmail' || kind === 'calendar') && !googleReady
  const viaBrowser = signsInWithBrowser(kind, form.fields)
  const isCustom = kind === 'mcp' || kind === 'command'

  return (
    <div className={styles.form}>
      {isCustom && (
        <TypeNameFields values={form.fields} onChange={form.patch} onKeyDown={form.handleKeyDown} />
      )}
      {!isCustom && kind !== 'browser' && (
        <TextField
          label={`${t(`connectors.kinds.${kind}.name`)} · ${t('connectors.add.label')}`}
          placeholder={t('connectors.add.labelPlaceholder')}
          value={form.fields.label}
          autoFocus
          data-autofocus
          onChange={form.set('label')}
          onKeyDown={form.handleKeyDown}
        />
      )}
      {kind === 'slack' && <AddSlackFields form={form} />}
      {kind === 'mcp' && <AddMcpFields form={form} />}
      {kind === 'command' && <AddCommandFields form={form} />}
      {kind === 'playwright' && <AddPlaywrightFields form={form} />}
      {kind === 'todoist' && (
        <TextField
          label={t('connectors.add.todoist.token')}
          type="password"
          value={form.fields.token}
          onChange={form.set('token')}
          onKeyDown={form.handleKeyDown}
        />
      )}
      {needsGoogle && <p className={styles.warning}>{t('connectors.add.googleFirst')}</p>}
      {form.error && <p className={styles.failure}>{t(`connectors.add.errors.${form.error}`)}</p>}
      <div className={styles.formActions}>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('connectors.add.cancel')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={viaBrowser ? LogIn : Plus}
          disabled={needsGoogle || form.isBusy}
          onClick={() => void form.submit()}>
          {t(viaBrowser ? 'connectors.add.submit' : 'connectors.add.submitPlain')}
        </Button>
      </div>
    </div>
  )
}
