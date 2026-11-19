import type { LucideIcon } from 'lucide-react'

import type { SettingsScreen } from '../panel.types'

/** Экраны, у которых есть строка в списке: три списка новой вкладки стоят глубже. */
export type SettingsRowScreen = Exclude<
  SettingsScreen,
  'newChatModel' | 'newChatEffort' | 'newChatMode'
>

/** Строка списка Settings: экран за ней и иконка. Подписи - по имени экрана в i18n. */
export type SettingsRow = { screen: SettingsRowScreen; icon: LucideIcon }
