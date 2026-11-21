import type { LucideIcon } from 'lucide-react'
import { Circle, CircleCheck, CirclePause } from 'lucide-react'

import type { TaskState } from '@shared/conversation-feed'

/** Значок стоящей задачи; у идущей вместо значка - Spinner. */
export const STATE_ICON: Record<Exclude<TaskState, 'in_progress'>, LucideIcon> = {
  pending: Circle,
  completed: CircleCheck,
}

/**
 * Значок идущей задачи, когда в разговоре ничего не идёт: модель кончила ход, не закрыв
 * задачу. Spinner здесь врал бы, что работа идёт под капотом.
 */
export const PAUSED_ICON: LucideIcon = CirclePause

/** Класс строки по состоянию: имена классов CSS Modules - camelCase. */
export const STATE_CLASS: Record<TaskState, string> = {
  pending: 'pending',
  in_progress: 'inProgress',
  completed: 'completed',
}
