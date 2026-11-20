import type { PickRowProps } from '../SettingsDialog.types'
import { PickButton } from './PickButton'
import { SettingRow } from './SettingRow'

/** Строка настройки с выбором из списка: подпись слева, кнопка выбора с меню справа. */
export const PickRow = ({ label, description, value, options, onPick }: PickRowProps) => (
  <SettingRow label={label} description={description}>
    <PickButton label={label} value={value} options={options} onPick={onPick} />
  </SettingRow>
)
