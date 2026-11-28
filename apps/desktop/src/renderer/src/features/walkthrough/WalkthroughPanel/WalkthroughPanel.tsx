import { useTranslation } from 'react-i18next'

import { PEN_TOOLS, ERASE_ICON } from './WalkthroughPanel.constants'
import { usePanel } from './WalkthroughPanel.hooks'
import styles from './WalkthroughPanel.module.scss'
import { PenButton } from './parts/PenButton'
import { ToolButton } from './parts/ToolButton'

/**
 * Панель инструментов человека в показе Walkthrough (ADR 0135) у правого края экрана: обвести,
 * подчеркнуть, показать стрелкой - и стереть свои пометки. Человек рисует и говорит, о чём это:
 * модель видит пометки. Пока инструмент в руке, ИИ мышь не трогает.
 */
export const WalkthroughPanel = () => {
  const { t } = useTranslation()
  const { view, pick, erase } = usePanel()

  return (
    <div
      className={styles.panel}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t('walkthrough.panel.label')}>
      {PEN_TOOLS.map(({ pen, icon, labelKey }) => (
        <PenButton
          key={pen}
          pen={pen}
          icon={icon}
          label={t(labelKey)}
          active={view.pen === pen}
          onPick={pick}
        />
      ))}
      <span className={styles.divider} aria-hidden />
      <ToolButton
        icon={ERASE_ICON}
        label={t('walkthrough.panel.erase')}
        disabled={!view.hasStrokes}
        onPress={erase}
      />
    </div>
  )
}
