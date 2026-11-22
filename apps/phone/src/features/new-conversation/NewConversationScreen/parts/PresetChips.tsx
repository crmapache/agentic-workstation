import { useTranslation } from 'react-i18next'

import type { ProviderPreset } from '@agentic-workstation/remote-protocol/wire-types'
import { Section } from '@agentic-workstation/ui/Section'
import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import styles from '../NewConversationScreen.module.scss'
import type { NewChoice } from '../NewConversationScreen.types'
import { activePreset } from '../NewConversationScreen.utils'

/**
 * Пресеты провайдера над моделью - те же кнопки, что под полем окна IDE (ADR 0096): нажатие ставит
 * модель, усилие и режим разом, горит та, чьи модель и усилие выбраны. Плашки делят ряд поровну.
 * Пресетов нет - нет и раздела.
 */
export const PresetChips = ({
  presets,
  choice,
  onPick,
}: {
  presets: readonly ProviderPreset[]
  choice: NewChoice
  onPick: (preset: ProviderPreset) => void
}) => {
  const { t } = useTranslation()
  const active = activePreset(presets, choice)

  if (presets.length === 0) return null

  return (
    <Section size="sm" title={t('newConversation.presets')}>
      <div role="group" aria-label={t('newConversation.presets')} className={styles.presets}>
        {presets.map((preset, index) => (
          <ToggleChip
            // Номер - место кнопки: имена двух пресетов могут совпасть.
            key={index}
            size="touch"
            fill
            label={preset.name}
            pressed={index === active}
            onChange={() => onPick(preset)}
          />
        ))}
      </div>
    </Section>
  )
}
