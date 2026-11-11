import { Palette, Volume2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { SettingsSection } from '../settings.types'

/** Пункты меню разделов, сверху вниз: новый раздел - строка здесь и его вид в SECTION_VIEWS. */
export const SETTINGS_SECTIONS: readonly { id: SettingsSection; icon: LucideIcon }[] = [
  { id: 'appearance', icon: Palette },
  { id: 'sounds', icon: Volume2 },
]
