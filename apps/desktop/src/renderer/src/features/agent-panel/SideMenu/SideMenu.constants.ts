import type { ComponentType } from 'react'
import type { ParseKeys } from 'i18next'

import type { MenuScreen, MenuScreenProps } from '../panel.types'
import { AccountsScreen } from '../AccountsScreen/AccountsScreen'
import { ConnectionsScreen } from '../ConnectionsScreen/ConnectionsScreen'
import { HistoryScreen } from '../HistoryScreen/HistoryScreen'
import { PluginsScreen } from '../PluginsScreen/PluginsScreen'
import { SettingsList } from '../SettingsList/SettingsList'
import { SETTINGS_VIEWS } from '../SettingsList/SettingsList.constants'

/**
 * Экран за каждым пунктом меню. Корень рисует MenuRoot; экрана, которого здесь нет,
 * в меню и не видно: строка на него не показывается.
 */
export const SCREEN_VIEWS: Partial<Record<MenuScreen, ComponentType<MenuScreenProps>>> = {
  history: HistoryScreen,
  plugins: PluginsScreen,
  accounts: AccountsScreen,
  connections: ConnectionsScreen,
  settings: SettingsList,
  ...SETTINGS_VIEWS,
}

/**
 * Пояснение экрана за «?» в шапке листа: что это и как работает. Абзацами на самом экране
 * оно не лежит (ADR 0030): там - только то, по чему человек действует сейчас.
 */
export const SCREEN_HELP: Partial<Record<MenuScreen, ParseKeys>> = {
  accounts: 'agentPanel.accounts.help',
  connections: 'openModels.connections.help',
  calmColors: 'agentPanel.calmColors.help',
  shareEditor: 'agentPanel.shareEditor.help',
  pasteCollapse: 'agentPanel.pasteCollapse.help',
  presets: 'agentPanel.presets.help',
  claudeConfig: 'agentPanel.claudeConfig.help',
}
