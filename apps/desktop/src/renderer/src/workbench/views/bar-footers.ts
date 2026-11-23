import { Settings, SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { BarAction } from '../ActivityBar/ActivityBar.types'
import { shortcutLabel } from '../../lib/keys'
import { useArrangement, useLayoutStore } from '../../state/layout.store'
import { useSettingsStore } from '../../features/settings/settings.store'
import { MAIN_VIEWS, FOOTER_MAIN_VIEW_ID } from './main-views'
import { viewLabel } from './view-label'

/**
 * Кнопки низа полос - действия, а не виды своей полосы. Левая: статистика и под ней настройки
 * IDE; статистика - вид середины окна, но её смотрят изредка, поэтому её кнопка здесь, а не среди
 * рабочих видов середины, и нажатие то же, что в той полосе. Правая: терминал под панелью
 * провайдера (ADR 0037). Их, как и виды, переставляют и прячут (ADR 0112).
 */
export const useBarFooters = (
  toggleTerminal: () => void,
): { side: BarAction[]; provider: BarAction[] } => {
  const { t } = useTranslation()
  const activeMainView = useLayoutStore((state) => state.main.activeViewId)
  const selectMainView = useLayoutStore((state) => state.selectMainView)
  const isTerminalOpen = useLayoutStore((state) => state.terminal.isOpen)
  const { isMainShown } = useArrangement()
  const isSettingsOpen = useSettingsStore((state) => state.isOpen)
  const openSettings = useSettingsStore((state) => state.open)
  const statistics = MAIN_VIEWS.find((view) => view.id === FOOTER_MAIN_VIEW_ID)

  return {
    side: [
      ...(statistics
        ? [
            {
              id: statistics.id,
              icon: statistics.icon,
              name: viewLabel(statistics, t),
              active: isMainShown && activeMainView === statistics.id,
              onClick: () => selectMainView(statistics.id),
            },
          ]
        : []),
      {
        id: 'settings',
        icon: Settings,
        name: t('settings.title'),
        hint: t('settings.open', { key: shortcutLabel('⌘,') }),
        active: isSettingsOpen,
        onClick: openSettings,
      },
    ],
    provider: [
      {
        id: 'terminal',
        icon: SquareTerminal,
        name: t('terminal.toggle'),
        active: isTerminalOpen,
        onClick: toggleTerminal,
      },
    ],
  }
}
