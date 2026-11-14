import type { LucideIcon } from 'lucide-react'

/**
 * Цвет значка проекта - номер `--color-avatar-*`, как AvatarTone дизайн-системы: состояние
 * окна дизайн-систему не импортирует, а тип тот же по форме и передаётся в Avatar как есть.
 */
export type ProjectTone = 0 | 1 | 2 | 3 | 4 | 5

/**
 * Значок проекта для Avatar: буквы и цвет по имени, у дома - знак дома. Та же форма, что у
 * пропсов Avatar, - передаётся в него как есть.
 */
export type ProjectAvatar = { tone: ProjectTone } & (
  { initials: string; icon?: undefined } | { icon: LucideIcon; initials?: undefined }
)
