import {
  Bot,
  Mic,
  Palette,
  Volume2,
  CalendarDays,
  MessageSquare,
  GitCommitHorizontal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { SettingsSection } from '../settings.types'

/** Пункты меню разделов, сверху вниз: новый раздел - строка здесь и его вид в SECTION_VIEWS. */
export const SETTINGS_SECTIONS: readonly { id: SettingsSection; icon: LucideIcon }[] = [
  { id: 'appearance', icon: Palette },
  { id: 'chat', icon: MessageSquare },
  { id: 'sounds', icon: Volume2 },
  { id: 'ai', icon: Bot },
  { id: 'voice', icon: Mic },
  { id: 'git', icon: GitCommitHorizontal },
  { id: 'calendar', icon: CalendarDays },
]

/** Минут в единице напоминания: в календаре оно хранится минутами. */
export const REMINDER_UNIT_MINUTES = { minutes: 1, hours: 60, days: 24 * 60 } as const

/** Каким встаёт новое напоминание: первое из этих, которого ещё нет, - час, сутки, полчаса. */
export const REMINDER_PRESETS = [60, 24 * 60, 30, 15, 5] as const
