import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import { SELECT_SAMPLES } from '../ComponentsView.constants'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Образец поля выбора: живое со списком шириной с поле, пустое с placeholder, недоступное и
 * два узких в ряд (час и минуты) - как в окнах запуска и расписания сценария.
 */
export const SelectFieldSpecimen = () => {
  const { t } = useTranslation('showcase')
  const popover = usePopover()
  const [picked, setPicked] = useState<string>(SELECT_SAMPLES[0])

  const handlePick = (value: string) => {
    popover.close()
    setPicked(value)
  }

  return (
    <>
      <Specimen label={t('specimens.selectField')} layout="column">
        <SelectField {...popover.triggerProps} label={t('samples.selectLabel')} value={picked} />
        <Popover {...popover.popoverProps} width="field">
          {popover.isOpen && (
            <Menu label={t('samples.selectLabel')} autoFocus>
              {SELECT_SAMPLES.map((value) => (
                <MenuItem
                  key={value}
                  label={value}
                  selection="single"
                  checked={value === picked}
                  onSelect={() => handlePick(value)}
                />
              ))}
            </Menu>
          )}
        </Popover>
        <SelectField
          label={t('samples.selectEmptyLabel')}
          value={null}
          placeholder={t('samples.selectPlaceholder')}
        />
        <SelectField label={t('samples.selectLabel')} value={picked} disabled />
      </Specimen>
      <Specimen label={t('specimens.selectFieldFit')}>
        <SelectField label={t('samples.selectHour')} value={t('samples.selectHourValue')} fit />
        <SelectField label={t('samples.selectMinute')} value={t('samples.selectMinuteValue')} fit />
      </Specimen>
    </>
  )
}
