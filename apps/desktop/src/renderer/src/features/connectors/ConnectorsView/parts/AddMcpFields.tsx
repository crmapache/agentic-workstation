import { useTranslation } from 'react-i18next'

import { Tabs } from '@agentic-workstation/ui/Tabs'
import { TextField } from '@agentic-workstation/ui/TextField'

import { MCP_AUTH_OPTIONS } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { AddFormState } from '../ConnectorsView.types'

/**
 * Поля своего MCP-сервера: адрес и способ входа - в браузере (сервер сам скажет, куда),
 * ключом в заголовке или без входа. Ключ ложится в хранилище IDE, в окно он не вернётся.
 */
export const AddMcpFields = ({ form }: { form: AddFormState }) => {
  const { t } = useTranslation()

  return (
    <>
      <TextField
        label={t('connectors.add.mcp.url')}
        placeholder={t('connectors.add.mcp.urlPlaceholder')}
        value={form.fields.url}
        onChange={form.set('url')}
        onKeyDown={form.handleKeyDown}
      />
      <span className={styles.fieldLabel}>{t('connectors.add.mcp.auth')}</span>
      <Tabs
        label={t('connectors.add.mcp.auth')}
        items={MCP_AUTH_OPTIONS.map((id) => ({
          id,
          label: t(`connectors.add.mcp.authOptions.${id}`),
        }))}
        value={form.fields.auth}
        onChange={form.set('auth')}
      />
      {form.fields.auth === 'token' && (
        <TextField
          label={t('connectors.add.mcp.token')}
          type="password"
          value={form.fields.token}
          onChange={form.set('token')}
          onKeyDown={form.handleKeyDown}
        />
      )}
    </>
  )
}
