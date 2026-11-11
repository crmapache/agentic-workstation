import type { KeyboardEvent } from 'react'
import { useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { Tabs } from '@agentic-workstation/ui/Tabs'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import {
  MODE_TONES,
  SECTION_STEPS,
  SECTION_TEXTS,
  SETUP_SECTIONS,
  SETUP_SEPARATOR,
} from '../ComposerStatus.constants'
import styles from '../ComposerStatus.module.scss'
import type { PickerProps, SetupSection } from '../ComposerStatus.types'
import { setupValue, nextSection } from '../ComposerStatus.utils'
import { usePanelPrefs, useModelCatalog } from '../../claude.queries'
import { FAST_MARK } from '../../model-chip.constants'
import { modelChip } from '../../model-chip.utils'
import { pickableModels } from '../../models.utils'
import { EffortItems } from './EffortItems'
import { ModeItems } from './ModeItems'
import { ModelItems } from './ModelItems'

/**
 * Модель, усилие и режим разговора одним индикатором под полем (своё IDE; в ACC - три
 * селектора): «Opus 5.5 · High effort · Auto». Режим - тоном слова, без иконки впереди: она
 * повторяла слово и только теснила строку. Модель не та (CLI сменил сам,
 * выбор не доехал) - жёлтым, ↯ - быстрый режим. По нажатию - панель с
 * разделами Model, Effort и Mode, в каждом выбирается своё; стрелки влево и вправо
 * переходят между разделами, высота панели при этом не меняется. Открывается на разделе,
 * открытом в прошлый раз.
 */
export const SetupPicker = ({ conversation }: PickerProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const prefs = usePanelPrefs()
  const models = pickableModels(useModelCatalog(), prefs.customModels)
  const [section, setSection] = useState<SetupSection>('model')
  const chip = modelChip(conversation, models, t)
  const value = setupValue(conversation, chip, t)
  const tone = MODE_TONES[conversation.permissionMode]
  const tabs = SETUP_SECTIONS.map((id) => ({ id, label: t(SECTION_TEXTS[id].tab) }))

  // Вкладки разделов ходят стрелками сами; здесь - стрелки из списка раздела.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = SECTION_STEPS[event.key]

    if (step === undefined || event.defaultPrevented) return

    event.preventDefault()
    setSection(nextSection(section, step))
  }

  return (
    <>
      <Tooltip label={value.hint} placement="top">
        <DropdownButton
          {...popover.triggerProps}
          size="sm"
          label={value.label}
          labelContent={
            <>
              <span className={clsx(chip.warning && styles.warning)}>{value.model}</span>
              {chip.fast && (
                <span className={clsx(styles.fastMark, styles[chip.fast])}>{FAST_MARK}</span>
              )}
              {SETUP_SEPARATOR}
              {value.effort}
              {SETUP_SEPARATOR}
              <span className={styles[tone]}>{value.mode}</span>
            </>
          }
          menuLabel={t('claudeCode.status.setup')}
        />
      </Tooltip>
      <Popover {...popover.popoverProps} width="md">
        {popover.isOpen && (
          <div className={styles.setupPanel} onKeyDown={handleKeyDown}>
            <div className={styles.sections}>
              <Tabs
                label={t('claudeCode.status.setup')}
                items={tabs}
                value={section}
                onChange={setSection}
              />
            </div>
            {/* Разделы стоят друг на друге, виден выбранный: панель держит высоту самого
                высокого, и переключение вкладок её не дёргает. */}
            <div className={styles.sectionPages}>
              {SETUP_SECTIONS.map((id) => (
                <div
                  key={id}
                  className={clsx(styles.sectionPage, id !== section && styles.sectionHidden)}>
                  <Menu label={t(SECTION_TEXTS[id].menu)} autoFocus={id === section}>
                    {id === 'model' && <ModelItems conversation={conversation} />}
                    {id === 'effort' && <EffortItems conversation={conversation} />}
                    {id === 'mode' && <ModeItems conversation={conversation} />}
                  </Menu>
                </div>
              ))}
            </div>
          </div>
        )}
      </Popover>
    </>
  )
}
