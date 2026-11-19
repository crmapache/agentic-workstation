import type { LucideIcon } from 'lucide-react'

import type { SettingsScreen } from '../panel.types'

/** Что закрепляется для новых вкладок. */
export type NewChatField = 'model' | 'effort' | 'mode'

/** Строка экрана New chats: поле, вложенный список за ней и иконка. */
export type NewChatRow = {
  field: NewChatField
  screen: Extract<SettingsScreen, 'newChatModel' | 'newChatEffort' | 'newChatMode'>
  icon: LucideIcon
}
