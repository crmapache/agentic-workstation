import type { LucideIcon } from 'lucide-react'
import { House } from 'lucide-react'

import type { ProjectTone } from './project-avatar.types'

/** Сколько цветов у значков проектов (--color-avatar-*). */
export const AVATAR_TONES: readonly ProjectTone[] = [0, 1, 2, 3, 4, 5]

/** Знак домашнего проекта (ADR 0059): его вкладка, значок в шапке и в меню проектов. */
export const HOME_ICON: LucideIcon = House

/** Цвет значка дома - стальной, спокойный: дом не проект и не спорит с цветами проектов. */
export const HOME_AVATAR_TONE: ProjectTone = 3
