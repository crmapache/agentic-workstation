import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { MAIN_VIEWS, FOOTER_MAIN_VIEW_ID } from '../views/main-views'
import { shortcutLabel } from '../../lib/keys'
import { useArrangement, useLayoutStore } from '../../state/layout.store'
import { useSettingsStore } from '../../features/settings/settings.store'

/**
 * Низ левой полосы: статистика и под ней настройки IDE. Статистика - вид середины окна, но
 * её смотрят изредка, поэтому её кнопка здесь, а не среди рабочих видов середины; нажатие то
 * же, что в той полосе.
 */
export const SideFooter = () => {
  const { t } = useTranslation()
  const activeMainView = useLayoutStore((state) => state.main.activeViewId)
  const selectMainView = useLayoutStore((state) => state.selectMainView)
  const arrangement = useArrangement()
  const isSettingsOpen = useSettingsStore((state) => state.isOpen)
  const openSettings = useSettingsStore((state) => state.open)
  const view = MAIN_VIEWS.find((one) => one.id === FOOTER_MAIN_VIEW_ID)

  return (
    <>
      {view && (
        <IconButton
          icon={view.icon}
          label={t(view.labelKey)}
          active={arrangement.isMainShown && activeMainView === view.id}
          tooltipPlacement="end"
          onClick={() => selectMainView(view.id)}
        />
      )}
      <IconButton
        icon={Settings}
        label={t('settings.open', { key: shortcutLabel('⌘,') })}
        active={isSettingsOpen}
        tooltipPlacement="end"
        onClick={openSettings}
      />
    </>
  )
}
