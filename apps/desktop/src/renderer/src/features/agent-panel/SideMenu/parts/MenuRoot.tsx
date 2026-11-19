import { Plug, Puzzle, History, Settings, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { useMenuSummary } from '../SideMenu.hooks'
import { usePanelCapabilities } from '../../panel.queries'
import { usePanelStore } from '../../panel.store'
import type { MenuScreenProps } from '../../panel.types'

/**
 * Корень бокового меню: пункт - экран, справа - что он скажет, не открывая его (число
 * разговоров, имя аккаунта цветом его состояния). Коннекторов здесь нет: у них своя кнопка
 * вида Connectors в полосе у середины окна (ADR 0029).
 */
export const MenuRoot = (props: MenuScreenProps) => {
  const { t } = useTranslation()
  const pickMenu = usePanelStore((store) => store.pickMenu)
  const summary = useMenuSummary(props)
  const capabilities = usePanelCapabilities()

  return (
    <Menu label={t('agentPanel.menu.titles.menu.title')} autoFocus>
      <MenuItem
        icon={History}
        iconTone="neutral"
        label={t('agentPanel.menu.rows.history.label')}
        description={t('agentPanel.menu.rows.history.sub')}
        hint={summary.history?.text}
        chevron
        onSelect={() => pickMenu('history')}
      />
      {capabilities.plugins && (
        <MenuItem
          icon={Puzzle}
          iconTone="neutral"
          label={t('agentPanel.menu.rows.plugins.label')}
          description={t('agentPanel.menu.rows.plugins.sub')}
          hint={summary.plugins?.text}
          chevron
          onSelect={() => pickMenu('plugins')}
        />
      )}
      {capabilities.accounts !== 'none' && (
        <MenuItem
          icon={UsersRound}
          iconTone={summary.accounts?.tone ?? 'neutral'}
          label={t('agentPanel.menu.rows.accounts.label')}
          description={t('agentPanel.menu.rows.accounts.sub')}
          hint={summary.accounts?.text}
          hintTone={summary.accounts?.tone}
          chevron
          onSelect={() => pickMenu('accounts')}
        />
      )}
      {capabilities.connections && (
        <MenuItem
          icon={Plug}
          iconTone="neutral"
          label={t('openModels.menu.rowLabel')}
          description={t('openModels.menu.rowSub')}
          hint={summary.connections?.text}
          chevron
          onSelect={() => pickMenu('connections')}
        />
      )}
      {/* Своя строка панели - последней: настройки настраивают саму панель, и им не
          место среди строк выше. */}
      <MenuItem
        icon={Settings}
        iconTone="neutral"
        label={t('agentPanel.menu.rows.settings.label')}
        description={t('agentPanel.menu.rows.settings.sub')}
        chevron
        onSelect={() => pickMenu('settings')}
      />
    </Menu>
  )
}
