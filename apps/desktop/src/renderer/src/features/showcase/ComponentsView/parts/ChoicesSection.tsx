import { useState } from 'react'
import clsx from 'clsx'
import { Bot, Search, FileText, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@agentic-workstation/ui/Avatar'
import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { ChoiceMark } from '@agentic-workstation/ui/ChoiceMark'
import { ClosableTab } from '@agentic-workstation/ui/ClosableTab'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { TextField } from '@agentic-workstation/ui/TextField'
import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import {
  CHIP_SAMPLES,
  SAMPLE_ICON_SIZE,
  SAMPLE_ICON_STROKE_WIDTH,
} from '../ComponentsView.constants'
import styles from '../ComponentsView.module.scss'
import { ShowcaseSection } from '../../ShowcaseSection/ShowcaseSection'
import { Specimen } from '../../Specimen/Specimen'
import { TabStripSpecimen } from './TabStripSpecimen'

/**
 * Раздел «Выбор и раскрытие»: карточка вопроса к человеку, строки-раскрывашки,
 * закрываемые вкладки, варианты выбора с отметкой, плашки-переключатели и меню с полем
 * поиска в шапке.
 */
export const ChoicesSection = () => {
  const { t } = useTranslation('showcase')
  const [isOpen, setIsOpen] = useState(true)
  const [choice, setChoice] = useState('red')
  const [query, setQuery] = useState('')
  const [chips, setChips] = useState<ReadonlySet<string>>(() => new Set(['agentic-workstation']))
  const icon = (Icon: typeof Bot) => (
    <Icon size={SAMPLE_ICON_SIZE} strokeWidth={SAMPLE_ICON_STROKE_WIDTH} aria-hidden />
  )

  const handleChip = (name: string, on: boolean) =>
    setChips((previous) => {
      const next = new Set(previous)

      if (on) next.add(name)
      else next.delete(name)

      return next
    })
  return (
    <ShowcaseSection title={t('sections.choices')}>
      <Specimen label={t('specimens.cardAccent')} layout="column">
        <Card tone="accent" icon={ShieldAlert} title={t('samples.permission')}>
          {t('samples.permissionText')}
          <div className={styles.cardBadges}>
            <Button variant="primary" size="sm">
              {t('samples.allow')}
            </Button>
            <Button variant="ghost" size="sm">
              {t('samples.deny')}
            </Button>
          </div>
        </Card>
      </Specimen>

      <Specimen label={t('specimens.disclosure')} layout="column">
        <div className={styles.stack}>
          <Disclosure expanded={isOpen} onClick={() => setIsOpen((value) => !value)}>
            {icon(FileText)}
            {t('samples.disclosureRow')}
          </Disclosure>
          <Disclosure expanded={false} disabled>
            {icon(Search)}
            {t('samples.disclosureEmpty')}
          </Disclosure>
          <Disclosure size="md" expanded={false}>
            {icon(Bot)}
            {t('samples.disclosureCard')}
          </Disclosure>
          <Disclosure size="touch" expanded={false}>
            {icon(FileText)}
            {t('samples.disclosureTouch')}
          </Disclosure>
        </div>
      </Specimen>

      <Specimen label={t('specimens.closableTabs')} layout="column">
        <div role="tablist" aria-label={t('specimens.closableTabs')} className={styles.tabStrip}>
          <ClosableTab
            label={t('samples.project')}
            hint={t('samples.currentPath')}
            active
            closeLabel={t('samples.close')}
            onActivate={() => undefined}
            onClose={() => undefined}
          />
          <ClosableTab
            label={t('samples.otherItem')}
            hint={t('samples.otherPath')}
            active={false}
            trailing={
              <span className={styles.tabDots} aria-hidden>
                <span className={clsx(styles.tabDot, styles.tabDotDone)} />
                <span className={clsx(styles.tabDot, styles.tabDotAsks)} />
              </span>
            }
            closeLabel={t('samples.close')}
            onActivate={() => undefined}
            onClose={() => undefined}
          />
          <ClosableTab
            width="fit"
            label={t('samples.chatTitle')}
            hint={t('samples.chatTitle')}
            active={false}
            closeLabel={t('samples.close')}
            onActivate={() => undefined}
            onClose={() => undefined}
          />
        </div>
      </Specimen>

      <TabStripSpecimen />

      <Specimen label={t('specimens.choiceMarks')}>
        <ChoiceMark shape="circle" checked={false} />
        <ChoiceMark shape="circle" checked />
        <ChoiceMark shape="square" checked={false} />
        <ChoiceMark shape="square" checked />
        <ChoiceMark shape="square" tone="success" checked />
      </Specimen>

      <Specimen label={t('specimens.toggleChip')}>
        {CHIP_SAMPLES.map(({ name, initials, tone }) => (
          <ToggleChip
            key={name}
            label={name}
            leading={<Avatar initials={initials} tone={tone} />}
            hint={t('samples.chipHint', { name })}
            pressed={chips.has(name)}
            onChange={(on) => handleChip(name, on)}
          />
        ))}
      </Specimen>

      <Specimen label={t('specimens.menuChoices')} layout="column">
        <div className={styles.menuBox}>
          <Menu
            label={t('samples.menuLabel')}
            header={
              <TextField
                label={t('samples.search')}
                hideLabel
                icon={Search}
                value={query}
                placeholder={t('samples.search')}
                onChange={setQuery}
              />
            }>
            <MenuItem
              selection="single"
              checked={choice === 'red'}
              label={t('samples.red')}
              description={t('samples.redHint')}
              onSelect={() => setChoice('red')}
            />
            <MenuItem
              selection="single"
              checked={choice === 'blue'}
              label={t('samples.blue')}
              description={t('samples.blueHint')}
              onSelect={() => setChoice('blue')}
            />
          </Menu>
        </div>
      </Specimen>
    </ShowcaseSection>
  )
}
