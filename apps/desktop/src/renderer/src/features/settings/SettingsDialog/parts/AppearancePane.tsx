import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Section } from '@agentic-workstation/ui/Section'
import { Slider } from '@agentic-workstation/ui/Slider'

import styles from '../SettingsDialog.module.scss'
import { TEXT_SIZE } from '../../../../state/text-size.constants'
import { useTextSizeStore } from '../../../../state/text-size.store'
import { SettingRow } from './SettingRow'

/**
 * Раздел «Appearance»: размер текста всей IDE (ADR 0024). Меняется сразу, под пальцем, и окно
 * под настройками не темнеет - результат видно на самой IDE; сброс к 100% - в той же строке.
 */
export const AppearancePane = () => {
  const { t } = useTranslation()
  const textSize = useTextSizeStore((state) => state.textSize)
  const setTextSize = useTextSizeStore((state) => state.setTextSize)
  const resetTextSize = useTextSizeStore((state) => state.resetTextSize)

  return (
    <Section
      title={t('settings.sections.appearance')}
      description={t('settings.appearanceDescription')}
      help={
        <HelpButton
          label={t('settings.textSize.helpLabel')}
          title={t('settings.textSize.label')}
          text={t('settings.textSize.hint')}
          closeLabel={t('common.close')}
        />
      }>
      <Card>
        <div className={styles.rows}>
          <SettingRow
            label={t('settings.textSize.label')}
            description={t('settings.textSize.description')}>
            <div className={styles.control}>
              <Slider
                label={t('settings.textSize.label')}
                hideLabel
                value={textSize}
                min={TEXT_SIZE.min}
                max={TEXT_SIZE.max}
                step={TEXT_SIZE.step}
                valueText={t('settings.textSize.value', { percent: textSize })}
                onChange={setTextSize}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={textSize === TEXT_SIZE.default}
              onClick={resetTextSize}>
              {t('settings.textSize.reset')}
            </Button>
          </SettingRow>
        </div>
      </Card>
    </Section>
  )
}
