import type { KeyboardEvent } from 'react'
import { useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { SECTION_STEPS, SECTION_TEXTS, SETUP_SECTIONS } from '../ComposerStatus.constants'
import styles from '../ComposerStatus.module.scss'
import type { SetupFlow, PickerProps, SetupSection } from '../ComposerStatus.types'
import { nextSection, stepAfterPick } from '../ComposerStatus.utils'
import { EffortItems } from './EffortItems'
import { ModeItems } from './ModeItems'
import { ModelItems } from './ModelItems'

/**
 * Содержимое панели индикатора: вкладки Model, Effort и Mode над списком раздела. Живёт, пока
 * панель открыта, - каждое открытие начинается с Model и идёт шагами: выбрали модель - вкладка
 * Effort, выбрали усилие - Mode, выбрали режим - панель закрылась. Раздел, открытый вкладкой
 * или стрелкой, - разовая правка: выбор в нём сразу закрывает панель.
 */
export const SetupPanel = ({ conversation }: PickerProps) => {
  const { t } = useTranslation()
  const [flow, setFlow] = useState<SetupFlow>({ section: 'model', guided: true })
  const next = stepAfterPick(flow)
  const tabs = SETUP_SECTIONS.map((id) => ({ id, label: t(SECTION_TEXTS[id].tab) }))
  const onPicked = next ? () => setFlow({ section: next, guided: true }) : undefined

  const handleChange = (section: SetupSection) => setFlow({ section, guided: false })

  // Вкладки разделов ходят стрелками сами; здесь - стрелки из списка раздела.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = SECTION_STEPS[event.key]

    if (step === undefined || event.defaultPrevented) return

    event.preventDefault()
    handleChange(nextSection(flow.section, step))
  }

  return (
    <div className={styles.setupPanel} onKeyDown={handleKeyDown}>
      <div className={styles.sections}>
        <Tabs
          label={t('claudeCode.status.setup')}
          items={tabs}
          value={flow.section}
          onChange={handleChange}
        />
      </div>
      {/* Разделы стоят друг на друге, виден выбранный: панель держит высоту самого
          высокого, и переключение вкладок её не дёргает. */}
      <div className={styles.sectionPages}>
        {SETUP_SECTIONS.map((id) => (
          <div
            key={id}
            className={clsx(styles.sectionPage, id !== flow.section && styles.sectionHidden)}>
            <Menu label={t(SECTION_TEXTS[id].menu)} autoFocus={id === flow.section}>
              {id === 'model' && <ModelItems conversation={conversation} onPicked={onPicked} />}
              {id === 'effort' && <EffortItems conversation={conversation} onPicked={onPicked} />}
              {id === 'mode' && <ModeItems conversation={conversation} />}
            </Menu>
          </div>
        ))}
      </div>
    </div>
  )
}
