import { useTranslation } from 'react-i18next'

import { TextField } from '@agentic-workstation/ui/TextField'

import type { AddFormState } from '../ConnectorsView.types'

/**
 * Поля MCP-сервера командой: строка команды как в терминале и переменные окружения парами
 * KEY=value. Ключи из переменных ложатся в хранилище IDE, в окно они не вернутся.
 */
export const AddCommandFields = ({ form }: { form: AddFormState }) => {
  const { t } = useTranslation()

  return (
    <>
      <TextField
        label={t('connectors.add.command.line')}
        placeholder={t('connectors.add.command.linePlaceholder')}
        value={form.fields.commandLine}
        onChange={form.set('commandLine')}
        onKeyDown={form.handleKeyDown}
      />
      <TextField
        label={t('connectors.add.command.env')}
        placeholder={t('connectors.add.command.envPlaceholder')}
        type="password"
        value={form.fields.envLine}
        onChange={form.set('envLine')}
        onKeyDown={form.handleKeyDown}
      />
    </>
  )
}
