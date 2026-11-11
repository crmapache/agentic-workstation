import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Section } from '@agentic-workstation/ui/Section'
import { Slider } from '@agentic-workstation/ui/Slider'

import { TEXT_SIZE } from '../../../../state/text-size.constants'
import { useTextSizeStore } from '../../../../state/text-size.store'

/**
 * Вид IDE: размер текста всей IDE (ADR 0024). Меняется сразу, под пальцем, и окно под
 * настройками не темнеет - результат видно на самой IDE; сброс к 100% - справа в шапке.
 */
export const AppearanceSection = () => {
  const { t } = useTranslation()
  const textSize = useTextSizeStore((state) => state.textSize)
  const setTextSize = useTextSizeStore((state) => state.setTextSize)
  const resetTextSize = useTextSizeStore((state) => state.resetTextSize)

  return (
    <Section
      size="sm"
      title={t('settings.appearance')}
      actions={
        <Button variant="ghost" disabled={textSize === TEXT_SIZE.default} onClick={resetTextSize}>
          {t('settings.textSize.reset')}
        </Button>
      }
      help={
        <HelpButton
          label={t('settings.textSize.helpLabel')}
          title={t('settings.textSize.label')}
          text={t('settings.textSize.hint')}
          closeLabel={t('common.close')}
        />
      }>
      <Slider
        label={t('settings.textSize.label')}
        value={textSize}
        min={TEXT_SIZE.min}
        max={TEXT_SIZE.max}
        step={TEXT_SIZE.step}
        valueText={t('settings.textSize.value', { percent: textSize })}
        onChange={setTextSize}
      />
    </Section>
  )
}
