import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import { PRESET_CHIP_SAMPLES } from '../ComponentsView.constants'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Плашки-переключатели размера sm - пресеты под полем ввода (ADR 0096): горит одна или ни
 * одной, нажатая снова остаётся нажатой - она ставит пресет, а не снимает его.
 */
export const PresetChipsSpecimen = () => {
  const { t } = useTranslation('showcase')
  const [pressed, setPressed] = useState(PRESET_CHIP_SAMPLES[0])

  return (
    <Specimen label={t('specimens.toggleChipSm')}>
      {PRESET_CHIP_SAMPLES.map((name) => (
        <ToggleChip
          key={name}
          size="sm"
          label={name}
          hint={t('samples.presetHint', { name })}
          hintPlacement="top"
          pressed={pressed === name}
          onChange={() => setPressed(name)}
        />
      ))}
    </Specimen>
  )
}
