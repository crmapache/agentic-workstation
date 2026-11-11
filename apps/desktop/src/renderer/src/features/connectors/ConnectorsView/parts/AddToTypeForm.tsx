import { Plus, LogIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useAddToTypeForm } from '../ConnectorsView.hooks'
import styles from '../ConnectorsView.module.scss'
import type { AddToTypeFormProps } from '../ConnectorsView.types'

/**
 * Ещё одно подключение своего типа: подпись и вход этого подключения - ключ своего MCP,
 * ключ (или логин и пароль) коннектора от ИИ. Чем оно работает, берётся у типа. Вход в
 * браузере начнётся сам, как у Gmail.
 */
export const AddToTypeForm = ({ type, onAdded, onCancel }: AddToTypeFormProps) => {
  const { t } = useTranslation()
  const form = useAddToTypeForm(type.id, onAdded)
  const viaBrowser = type.signIn === 'browser'

  return (
    <div className={styles.form}>
      <TextField
        label={`${type.name} · ${t('connectors.add.label')}`}
        placeholder={t('connectors.add.labelPlaceholder')}
        value={form.fields.label}
        autoFocus
        data-autofocus
        onChange={form.set('label')}
        onKeyDown={form.handleKeyDown}
      />
      {type.signIn === 'token' && (
        <TextField
          label={t('connectors.add.mcp.token')}
          type="password"
          value={form.fields.token}
          onChange={form.set('token')}
          onKeyDown={form.handleKeyDown}
        />
      )}
      {type.signIn === 'basic' && (
        <TextField
          label={t('connectors.ai.username')}
          value={form.fields.username}
          onChange={form.set('username')}
          onKeyDown={form.handleKeyDown}
        />
      )}
      {(type.signIn === 'key' || type.signIn === 'basic') && (
        <TextField
          label={t(type.signIn === 'basic' ? 'connectors.ai.password' : 'connectors.ai.key')}
          type="password"
          value={form.fields.secret}
          onChange={form.set('secret')}
          onKeyDown={form.handleKeyDown}
        />
      )}
      {form.error && <p className={styles.failure}>{t(`connectors.add.errors.${form.error}`)}</p>}
      <div className={styles.formActions}>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('connectors.add.cancel')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={viaBrowser ? LogIn : Plus}
          disabled={form.isBusy}
          onClick={form.submit}>
          {t(viaBrowser ? 'connectors.add.submit' : 'connectors.add.submitPlain')}
        </Button>
      </div>
    </div>
  )
}
