import { AVATAR_TONES } from './project-avatar.constants'
import type { ProjectTone } from './project-avatar.types'

/**
 * Инициалы проекта, как в WebStorm: первые буквы двух первых слов имени
 * (agentic-workstation → AW, roasRadar → RR), у имени из одного слова - две первые буквы. Значок
 * один на всю IDE: шапка, меню проекта, плашки проектов у коннектора.
 */
export const projectInitials = (name: string): string => {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  const [first = '', second] = words
  const initials = second ? `${first[0]}${second[0]}` : first.slice(0, 2)

  return initials.toUpperCase() || '?'
}

/** Цвет значка по имени: один и тот же проект всегда одного цвета. */
export const projectTone = (name: string): ProjectTone => {
  let hash = 0

  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0

  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? 0
}
