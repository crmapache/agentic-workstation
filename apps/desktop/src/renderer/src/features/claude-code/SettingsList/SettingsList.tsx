import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { useClaudeCodeStore } from '../claude-code.store'
import { usePanelPrefs } from '../claude.queries'
import { SETTINGS_ROWS, SETTINGS_VIEWS } from './SettingsList.constants'
import { settingValue } from './SettingsList.utils'

/**
 * Экран Settings бокового меню: настройки панели строками, у каждой - значение справа
 * и свой экран за ней. Все настройки - на машину.
 */
export const SettingsList = () => {
  const { t } = useTranslation()
  const prefs = usePanelPrefs()
  const pickMenu = useClaudeCodeStore((store) => store.pickMenu)
  const rows = SETTINGS_ROWS.filter((row) => SETTINGS_VIEWS[row.screen])

  return (
    <Menu label={t('claudeCode.menu.titles.settings.title')} autoFocus>
      {rows.map((row) => (
        <MenuItem
          key={row.screen}
          icon={row.icon}
          iconTone="neutral"
          label={t(`claudeCode.settings.rows.${row.screen}.label`)}
          description={t(`claudeCode.settings.rows.${row.screen}.sub`)}
          hint={settingValue(row.screen, prefs, t) || undefined}
          chevron
          onSelect={() => pickMenu(row.screen)}
        />
      ))}
    </Menu>
  )
}
