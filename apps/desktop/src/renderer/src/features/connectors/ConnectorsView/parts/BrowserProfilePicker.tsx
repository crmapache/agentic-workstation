import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import type { BrowserProfilePickerProps } from '../ConnectorsView.types'
import { profileChoices } from '../ConnectorsView.utils'

/**
 * Профиль Chrome проекта (ADR 0053): в нём ИИ открывает свои вкладки, пока человек не назвал
 * другой. Выбор - из подключённых профилей; выбранный, которого сейчас нет на связи, виден
 * со словами об этом, а не пропадает.
 */
export const BrowserProfilePicker = ({
  value,
  profiles,
  chromeProfiles,
  onPick,
}: BrowserProfilePickerProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const label = t('connectors.inProject.profile')
  const none = t('connectors.inProject.anyProfile')

  const handlePick = (profile: string | null) => {
    popover.close()
    onPick(profile)
  }

  return (
    <>
      <SelectField {...popover.triggerProps} label={label} value={value} placeholder={none} />
      <Popover {...popover.popoverProps} width="field">
        {popover.isOpen && (
          <Menu label={label} autoFocus>
            <MenuItem
              label={none}
              selection="single"
              checked={value === null}
              onSelect={() => handlePick(null)}
            />
            {profileChoices(profiles, chromeProfiles, value).map((choice) => (
              <MenuItem
                key={choice.name}
                label={choice.name}
                description={
                  choice.state === 'connected'
                    ? undefined
                    : t(`connectors.inProject.profileState.${choice.state}`)
                }
                selection="single"
                checked={choice.name === value}
                onSelect={() => handlePick(choice.name)}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </>
  )
}
