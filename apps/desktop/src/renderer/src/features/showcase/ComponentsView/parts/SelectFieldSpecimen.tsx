import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import { SELECT_SAMPLES } from '../ComponentsView.constants'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Образец поля выбора: живое со списком шириной с поле, пустое с placeholder, недоступное,
 * выбор из списка (ChoiceField) с пояснением и погашенным вариантом и два узких в ряд (час и
 * минуты) - как в окнах запуска и расписания сценария.
 */
export const SelectFieldSpecimen = () => {
  const { t } = useTranslation('showcase')
  const popover = usePopover()
  const [picked, setPicked] = useState<string>(SELECT_SAMPLES[0])
  const [choice, setChoice] = useState<string>(SELECT_SAMPLES[0])

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
      <Specimen label={t('specimens.choiceField')} layout="column">
        <ChoiceField
          label={t('samples.selectLabel')}
          value={choice}
          options={SELECT_SAMPLES.map((value, index) => ({
            value,
            label: value,
            description: index === 0 ? t('samples.choiceHint') : undefined,
            disabled: index === SELECT_SAMPLES.length - 1,
          }))}
          onPick={setChoice}
        />
      </Specimen>
      <Specimen label={t('specimens.selectFieldFit')}>
        <SelectField label={t('samples.selectHour')} value={t('samples.selectHourValue')} fit />
        <SelectField label={t('samples.selectMinute')} value={t('samples.selectMinuteValue')} fit />
      </Specimen>
    </>
  )
}
