import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Section } from '@agentic-workstation/ui/Section'
import { Switch } from '@agentic-workstation/ui/Switch'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../ConnectorsView.module.scss'
import type { TypePartProps } from '../ConnectorsView.types'
import { useConnectorActions } from '../../../../state/connectors.queries'
import { ConnectorsHelp } from './ConnectorsHelp'

/**
 * Свой тип подключения (ADR 0034): имя - сохраняется при уходе из поля и по Enter, имена
 * серверов при этом не меняются; «несколько подключений» - тип встаёт в каталог. Вернуть
 * «один раз» можно, только пока подключение одно.
 */
export const CustomTypeSettings = ({ type, connections }: TypePartProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const [name, setName] = useState(type.name)
  const isLocked = type.multiple && connections > 1

  const handleSave = () => {
    if (name.trim() && name.trim() !== type.name) actions.updateType({ typeId: type.id, name })
    else setName(type.name)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  return (
    <Section
      size="sm"
      title={t('connectors.types.settings.title')}
      help={<ConnectorsHelp topic="type" />}>
      <div className={styles.stack}>
        <TextField
          label={t('connectors.types.settings.name')}
          value={name}
          onChange={setName}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.formSwitch}>
          <Switch
            label={t('connectors.types.settings.multiple')}
            description={
              isLocked
                ? t('connectors.types.settings.multipleLocked', { count: connections })
                : t('connectors.types.settings.multipleHint')
            }
            checked={type.multiple}
            disabled={isLocked}
            onChange={(multiple) => actions.updateType({ typeId: type.id, multiple })}
          />
        </div>
      </div>
    </Section>
  )
}
