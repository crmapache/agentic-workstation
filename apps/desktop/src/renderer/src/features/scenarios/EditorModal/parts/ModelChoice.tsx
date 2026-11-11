import { useTranslation } from 'react-i18next'

import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { useModelCatalog } from '../EditorModal.hooks'
import styles from '../EditorModal.module.scss'
import type { PickerOption, ModelChoiceProps } from '../EditorModal.types'
import { modelMenu } from '../EditorModal.utils'

/**
 * MODEL головы или карточки: «пусто» (как новый чат или как голова), основные модели каталога,
 * старые версии - свёрнутой группой, свои модели следом. Имя из файла, которого нет в списке,
 * остаётся своим пунктом: открыть сценарий не должно молча менять, на чём он идёт.
 */
export const ModelChoice = ({ value, fallback, onPick }: ModelChoiceProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const menu = modelMenu(useModelCatalog())
  const known = [...menu.main, ...menu.older, ...menu.custom]
  const caption = t('scenarios.editor.runsOn.model')
  const label = value ? (known.find((one) => one.id === value)?.label ?? value) : fallback.label

  const handlePick = (model: string) => {
    popover.close()
    onPick(model)
  }

  const toItem = (option: PickerOption) => (
    <MenuItem
      key={option.id}
      label={option.label}
      description={option.description}
      current={option.id === value}
      onSelect={() => handlePick(option.id)}
    />
  )

  return (
    <span className={styles.picker}>
      <span className={styles.pickerCaption} aria-hidden>
        {caption}
      </span>
      <Tooltip label={t('scenarios.editor.pickerHint', { caption, value: label })}>
        <DropdownButton {...popover.triggerProps} size="sm" label={label} menuLabel={caption} />
      </Tooltip>
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={caption} autoFocus>
            {toItem({ ...fallback, id: '' })}
            {menu.main.map(toItem)}
            {menu.older.length > 0 && (
              <MenuSection
                title={t('scenarios.editor.runsOn.otherModels')}
                collapsible
                defaultCollapsed>
                {menu.older.map(toItem)}
              </MenuSection>
            )}
            {menu.custom.map(toItem)}
            {value !== '' &&
              !known.some((one) => one.id === value) &&
              toItem({ id: value, label: value })}
          </Menu>
        )}
      </Popover>
    </span>
  )
}
