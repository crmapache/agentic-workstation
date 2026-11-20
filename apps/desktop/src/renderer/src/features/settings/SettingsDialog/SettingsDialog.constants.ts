import { Bot, Palette, Volume2, MessageSquare, GitCommitHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { SettingsSection } from '../settings.types'

/** Пункты меню разделов, сверху вниз: новый раздел - строка здесь и его вид в SECTION_VIEWS. */
export const SETTINGS_SECTIONS: readonly { id: SettingsSection; icon: LucideIcon }[] = [
  { id: 'appearance', icon: Palette },
  { id: 'chat', icon: MessageSquare },
  { id: 'sounds', icon: Volume2 },
  { id: 'ai', icon: Bot },
  { id: 'git', icon: GitCommitHorizontal },
]
