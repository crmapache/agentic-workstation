import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Disclosure } from '@agentic-workstation/ui/Disclosure'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import styles from '../ClaudeConfigScreen.module.scss'
import type { ConfigRowProps } from '../ClaudeConfigScreen.types'
import { optionWord } from '../ClaudeConfigScreen.utils'

/**
 * Настройка с вариантами: строка с текущим значением раскрывает список вариантов на
 * месте - вариантов бывает десяток (модели, темы), в ряд они не встают. Неизвестное
 * значение не отмечает ни один вариант: CLI решает сам.
 */
export const ConfigChoice = ({
  setting,
  label,
  note,
  disabled,
  onSet,
}: Omit<ConfigRowProps, 'failure'>) => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)

  const handlePick = (option: string) => {
    setIsExpanded(false)

    if (option !== setting.value) onSet(setting.key, option)
  }

  return (
    <>
      <Disclosure
        expanded={isExpanded}
        disabled={disabled}
        onClick={() => setIsExpanded(!isExpanded)}>
        <span className={styles.text}>
          <span className={styles.label}>{label}</span>
          {note && <span className={styles.note}>{note}</span>}
        </span>
        {setting.value !== null && (
          <span className={styles.current}>{optionWord(setting.value, t)}</span>
        )}
      </Disclosure>
      {isExpanded && !disabled && (
        <Menu label={label}>
          {setting.options.map((option) => (
            <MenuItem
              key={option}
              selection="single"
              checked={option === setting.value}
              label={optionWord(option, t)}
              onSelect={() => handlePick(option)}
            />
          ))}
        </Menu>
      )}
    </>
  )
}
