import type { ComponentType } from 'react'
import {
  Cpu,
  Zap,
  Gauge,
  Palette,
  FileText,
  SquarePlus,
  ClipboardList,
  SquareTerminal,
} from 'lucide-react'

import type { SettingsScreen, MenuScreenProps } from '../panel.types'
import { CalmColorsScreen } from '../CalmColorsScreen/CalmColorsScreen'
import { ClaudeConfigScreen } from '../ClaudeConfigScreen/ClaudeConfigScreen'
import { CustomModelsScreen } from '../CustomModelsScreen/CustomModelsScreen'
import { MetersScreen } from '../MetersScreen/MetersScreen'
import { NewChatChoiceScreen } from '../NewChatChoiceScreen/NewChatChoiceScreen'
import { NewChatScreen } from '../NewChatScreen/NewChatScreen'
import { PasteCollapseScreen } from '../PasteCollapseScreen/PasteCollapseScreen'
import { PresetScreen } from '../PresetScreen/PresetScreen'
import { PresetsScreen } from '../PresetsScreen/PresetsScreen'
import { ShareEditorScreen } from '../ShareEditorScreen/ShareEditorScreen'
import type { SettingsRow } from './SettingsList.types'

/**
 * Порядок как в ACC: сначала то, за чем открывают список (цвета шкал и какие из них видны),
 * потом новые вкладки и пресеты под полем (ADR 0096), потом поле ввода, потом настройки самого
 * Claude Code и свои модели.
 * Звуки - настройка IDE (Settings → Sounds, ADR 0046), а не панели.
 */
export const SETTINGS_ROWS: readonly SettingsRow[] = [
  { screen: 'calmColors', icon: Palette },
  { screen: 'meters', icon: Gauge },
  { screen: 'newChat', icon: SquarePlus },
  { screen: 'presets', icon: Zap },
  { screen: 'shareEditor', icon: FileText },
  { screen: 'pasteCollapse', icon: ClipboardList },
  { screen: 'claudeConfig', icon: SquareTerminal },
  { screen: 'customModels', icon: Cpu },
]

/**
 * Экраны настроек. Строка в списке видна, только когда у её экрана есть вид: недоделанный
 * экран не обещает настройку, которой нет.
 */
export const SETTINGS_VIEWS: Partial<Record<SettingsScreen, ComponentType<MenuScreenProps>>> = {
  calmColors: CalmColorsScreen,
  meters: MetersScreen,
  newChat: NewChatScreen,
  newChatModel: NewChatChoiceScreen,
  newChatEffort: NewChatChoiceScreen,
  newChatMode: NewChatChoiceScreen,
  presets: PresetsScreen,
  preset1: PresetScreen,
  preset2: PresetScreen,
  preset3: PresetScreen,
  shareEditor: ShareEditorScreen,
  pasteCollapse: PasteCollapseScreen,
  claudeConfig: ClaudeConfigScreen,
  customModels: CustomModelsScreen,
}
