import { Switch } from '@agentic-workstation/ui/Switch'

import styles from '../ClaudeConfigScreen.module.scss'
import type { ConfigRowProps } from '../ClaudeConfigScreen.types'
import { isSwitch } from '../ClaudeConfigScreen.utils'
import { ConfigChoice } from './ConfigChoice'
import { ConfigValue } from './ConfigValue'

/**
 * Ряд настройки Claude Code: переключатель, если вариантов ровно вкл/выкл и значение
 * известно; свободное значение - поле с «Save»; иначе - список вариантов. Под рядом -
 * отказ CLI его словами.
 */
export const ConfigRow = (props: ConfigRowProps) => {
  const { setting, label, note, disabled, failure, onSet } = props

  return (
    <div className={styles.row}>
      {isSwitch(setting) && setting.value !== null && (
        <Switch
          label={label}
          description={note}
          checked={setting.value === 'true'}
          disabled={disabled}
          onChange={(isOn) => onSet(setting.key, String(isOn))}
        />
      )}
      {setting.free && (
        <div className={styles.free}>
          <span className={styles.text}>
            <span className={styles.label}>{label}</span>
            {note && <span className={styles.note}>{note}</span>}
          </span>
          <ConfigValue
            key={setting.value ?? ''}
            value={setting.value ?? ''}
            label={label}
            disabled={disabled}
            onSave={(value) => onSet(setting.key, value)}
          />
        </div>
      )}
      {!setting.free && !(isSwitch(setting) && setting.value !== null) && (
        <ConfigChoice {...props} />
      )}
      {failure && (
        <div role="alert" className={styles.failure}>
          {failure}
        </div>
      )}
    </div>
  )
}
