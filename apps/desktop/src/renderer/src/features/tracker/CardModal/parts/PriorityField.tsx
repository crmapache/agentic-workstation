import { Flag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { TRACKER_PRIORITIES } from '@shared/tracker'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import type { PriorityFieldProps } from '../CardModal.types'
import { priorityTone } from '../../tracker.utils'

/** Приоритет карточки, как в Todoist: флажок цвета приоритета, P4 - без приоритета. */
export const PriorityField = ({ form }: PriorityFieldProps) => {
  const { t } = useTranslation()
  const popover = usePopover()

  return (
    <div>
      <SelectField
        {...popover.triggerProps}
        label={t('tracker.priority.label')}
        value={t(`tracker.priority.${form.priority}`)}
      />
      <Popover {...popover.popoverProps} width="field">
        {popover.isOpen && (
          <Menu label={t('tracker.priority.label')} autoFocus>
            {TRACKER_PRIORITIES.map((priority) => (
              <MenuItem
                key={priority}
                icon={Flag}
                iconTone={priorityTone(priority) ?? undefined}
                label={t(`tracker.priority.${priority}`)}
                selection="single"
                checked={form.priority === priority}
                onSelect={() => {
                  popover.close()
                  form.set('priority', priority)
                }}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </div>
  )
}
