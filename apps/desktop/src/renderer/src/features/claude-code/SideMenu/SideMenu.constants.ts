import type { ComponentType } from 'react'
import type { ParseKeys } from 'i18next'

import type { MenuScreen, MenuScreenProps } from '../claude.types'
import { AccountsScreen } from '../AccountsScreen/AccountsScreen'
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
  settings: SettingsList,
  ...SETTINGS_VIEWS,
}

/**
 * Пояснение экрана за «?» в шапке листа: что это и как работает. Абзацами на самом экране
 * оно не лежит (ADR 0030): там - только то, по чему человек действует сейчас.
 */
export const SCREEN_HELP: Partial<Record<MenuScreen, ParseKeys>> = {
  accounts: 'claudeCode.accounts.help',
  calmColors: 'claudeCode.calmColors.help',
  shareEditor: 'claudeCode.shareEditor.help',
  pasteCollapse: 'claudeCode.pasteCollapse.help',
  claudeConfig: 'claudeCode.claudeConfig.help',
}
