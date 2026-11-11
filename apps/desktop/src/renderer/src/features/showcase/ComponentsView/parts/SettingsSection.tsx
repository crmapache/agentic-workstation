import { useState } from 'react'
import { Plug, History, Settings, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { RingMeter } from '@agentic-workstation/ui/RingMeter'
import { Sheet } from '@agentic-workstation/ui/Sheet'
import { Slider } from '@agentic-workstation/ui/Slider'
import { Switch } from '@agentic-workstation/ui/Switch'

import { RING_SAMPLES } from '../ComponentsView.constants'
import styles from '../ComponentsView.module.scss'
import { ShowcaseSection } from '../../ShowcaseSection/ShowcaseSection'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Раздел «Настройки и шкалы»: переключатель, ползунок, кольца лимитов и боковой лист
 * со строками меню - иконка в плитке, значение справа, стрелка на следующий экран.
 */
export const SettingsSection = () => {
  const { t } = useTranslation('showcase')
  const [isOn, setIsOn] = useState(true)
  const [volume, setVolume] = useState(70)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isNested, setIsNested] = useState(false)

  const handleClose = () => {
    setIsSheetOpen(false)
    setIsNested(false)
  }

  return (
    <ShowcaseSection title={t('sections.settings')}>
      <Specimen label={t('specimens.switch')} layout="column">
        <div className={styles.stack}>
          <Switch
            label={t('samples.spellcheck')}
            description={t('samples.spellcheckHint')}
            checked={isOn}
            onChange={setIsOn}
          />
          <Switch
            label={t('samples.disabled')}
            checked={false}
            disabled
            onChange={() => undefined}
          />
          <Switch label={t('samples.enabled')} labelHidden checked={isOn} onChange={setIsOn} />
        </div>
      </Specimen>

      <Specimen label={t('specimens.slider')} layout="column">
        <Slider
          label={t('samples.volume')}
          value={volume}
          min={0}
          max={100}
          valueText={t('samples.percent', { value: volume })}
          onChange={setVolume}
        />
      </Specimen>

      <Specimen label={t('specimens.ringMeter')}>
        {RING_SAMPLES.map((sample) => (
          <RingMeter
            key={sample.key}
            value={sample.value}
            pace={sample.pace}
            tone={sample.tone}
            burning={sample.burning}
            label={t('samples.percent', { value: sample.value })}
          />
        ))}
      </Specimen>

      <Specimen label={t('specimens.sheet')} layout="column">
        <div className={styles.sheetBox}>
          <Button variant="secondary" size="sm" onClick={() => setIsSheetOpen(true)}>
            {t('samples.openSheet')}
          </Button>
          <Sheet
            open={isSheetOpen}
            title={isNested ? t('samples.settings') : t('samples.menuLabel')}
            help={
              <HelpButton
                label={t('samples.help')}
                title={t('samples.menuLabel')}
                text={t('samples.sheetHelp')}
                closeLabel={t('samples.close')}
              />
            }
            backLabel={t('samples.back')}
            closeLabel={t('samples.close')}
            screenKey={isNested ? 'settings' : 'menu'}
            restoreScroll={!isNested}
            footer={t('samples.project')}
            onBack={isNested ? () => setIsNested(false) : undefined}
            onClose={handleClose}>
            <Menu label={t('samples.menuLabel')}>
              <MenuItem
                icon={History}
                iconTone="neutral"
                label={t('samples.history')}
                description={t('samples.historyHint')}
                hint="10"
                chevron
                onSelect={() => setIsNested(true)}
              />
              <MenuItem
                icon={Plug}
                iconTone="success"
                label={t('samples.mcp')}
                description={t('samples.mcpHint')}
                hint="4/4"
                hintTone="success"
                chevron
                onSelect={() => setIsNested(true)}
              />
              <MenuItem
                icon={UserRound}
                iconTone="warning"
                label={t('samples.accounts')}
                description={t('samples.accountsHint')}
                hint={t('samples.signedOut')}
                hintTone="warning"
                chevron
                onSelect={() => setIsNested(true)}
              />
              <MenuItem
                icon={Settings}
                iconTone="neutral"
                label={t('samples.settings')}
                description={t('samples.settingsHint')}
                chevron
                onSelect={() => setIsNested(true)}
              />
            </Menu>
          </Sheet>
        </div>
      </Specimen>
    </ShowcaseSection>
  )
}
