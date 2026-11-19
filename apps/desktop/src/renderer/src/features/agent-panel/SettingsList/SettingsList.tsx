import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { usePanelPrefs, usePanelCapabilities } from '../panel.queries'
import { usePanelStore } from '../panel.store'
import { SETTINGS_ROWS, SETTINGS_VIEWS } from './SettingsList.constants'
import { offersRow, settingValue } from './SettingsList.utils'

/**
 * Экран Settings бокового меню: настройки панели строками, у каждой - значение справа
 * и свой экран за ней. Все настройки - на машину.
 */
export const SettingsList = () => {
  const { t } = useTranslation()
  const prefs = usePanelPrefs()
  const pickMenu = usePanelStore((store) => store.pickMenu)
  const capabilities = usePanelCapabilities()
  const rows = SETTINGS_ROWS.filter(
    (row) => SETTINGS_VIEWS[row.screen] && offersRow(row.screen, capabilities),
  )

  return (
    <Menu label={t('agentPanel.menu.titles.settings.title')} autoFocus>
      {rows.map((row) => (
        <MenuItem
          key={row.screen}
          icon={row.icon}
          iconTone="neutral"
          label={t(`agentPanel.settings.rows.${row.screen}.label`)}
          description={t(`agentPanel.settings.rows.${row.screen}.sub`)}
          hint={settingValue(row.screen, prefs, t) || undefined}
          chevron
          onSelect={() => pickMenu(row.screen)}
        />
      ))}
    </Menu>
  )
}
