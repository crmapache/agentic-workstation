import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../EditorModal.module.scss'
import type { PickerOption, ChoicePickerProps } from '../EditorModal.types'

/**
 * Один выбор из нескольких - подпись капсом и тихая кнопка со значением, меню под ней (Picker
 * в ACC). Значение, которого нет среди вариантов (сценарий старше меню, другой аккаунт),
 * остаётся своим пунктом: открыть форму не должно молча менять сценарий.
 */
export const ChoicePicker = ({
  caption,
  menuLabel,
  value,
  options,
  tone,
  onPick,
}: ChoicePickerProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const chosen = options.find((option) => option.id === value)
  const shown: PickerOption = chosen ?? { id: value, label: value }
  const all = chosen ? options : [...options, shown]

  return (
    <span className={styles.picker}>
      <span className={styles.pickerCaption} aria-hidden>
        {caption}
      </span>
      <Tooltip label={t('scenarios.editor.pickerHint', { caption, value: shown.label })}>
        <DropdownButton
          {...popover.triggerProps}
          size="sm"
          label={shown.label}
          labelContent={<span className={clsx(tone && styles[tone])}>{shown.label}</span>}
          menuLabel={menuLabel}
        />
      </Tooltip>
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={menuLabel} autoFocus>
            {all.map((option) => (
              <MenuItem
                key={option.id}
                icon={option.icon}
                label={option.label}
                description={option.description}
                current={option.id === value}
                onSelect={() => {
                  popover.close()
                  onPick(option.id)
                }}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </span>
  )
}
