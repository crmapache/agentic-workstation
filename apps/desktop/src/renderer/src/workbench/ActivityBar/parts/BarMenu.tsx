import { Fragment } from 'react'
import { EyeOff, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Popover } from '@agentic-workstation/ui/Popover'
import { useAnchoredPopover } from '@agentic-workstation/ui/Popover.hooks'

import type { BarMenuProps } from '../ActivityBar.types'
import { useBarArrangement, useBarButtonsStore } from '../../../state/bar-buttons.store'
import { menuGroups } from '../../../state/bar-buttons.utils'

/**
 * Меню правой кнопки на полосе: спрятать кнопку, на которой нажали, галочки всех кнопок полосы
 * (их же показывает меню View - на Windows его полосы не видно) и вернуть полосу как было.
 * Галочки меню не закрывают: можно снять и поставить несколько подряд.
 */
export const BarMenu = ({ bar, label, groups, targetId, anchor, onClose }: BarMenuProps) => {
  const { t } = useTranslation()
  const { id, ref, onToggle } = useAnchoredPopover(anchor, onClose)
  const arrangement = useBarArrangement(bar)
  const setShown = useBarButtonsStore((state) => state.setShown)
  const reset = useBarButtonsStore((state) => state.reset)
  const lists = menuGroups(groups, arrangement)
  const target = [...groups.top, ...groups.bottom].find((button) => button.id === targetId)

  return (
    <Popover id={id} ref={ref} onToggle={onToggle}>
      <Menu label={t('activityBar.menu', { bar: label })} autoFocus>
        {target && (
          <>
            <MenuItem
              icon={EyeOff}
              label={t('activityBar.hide', { label: target.name })}
              onSelect={() => setShown(bar, target.id, false)}
            />
            <MenuSeparator />
          </>
        )}
        <MenuSection title={t('activityBar.buttons')}>
          {lists.map((list, index) => (
            <Fragment key={list[0]?.button.id}>
              {index > 0 && <MenuSeparator />}
              {list.map(({ button, shown }) => (
                <MenuItem
                  key={button.id}
                  label={button.name}
                  selection="multiple"
                  checked={shown}
                  onSelect={() => setShown(bar, button.id, !shown)}
                />
              ))}
            </Fragment>
          ))}
        </MenuSection>
        <MenuSeparator />
        <MenuItem icon={RotateCcw} label={t('activityBar.reset')} onSelect={() => reset(bar)} />
      </Menu>
    </Popover>
  )
}
