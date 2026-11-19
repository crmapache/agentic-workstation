import type { LucideIcon } from 'lucide-react'
import { Circle, CircleCheck } from 'lucide-react'

import type { TaskState } from '@shared/conversation-feed'

/** Значок стоящей задачи; у идущей вместо значка - Spinner. */
export const STATE_ICON: Record<Exclude<TaskState, 'in_progress'>, LucideIcon> = {
  pending: Circle,
  completed: CircleCheck,
}

/** Класс строки по состоянию: имена классов CSS Modules - camelCase. */
export const STATE_CLASS: Record<TaskState, string> = {
  pending: 'pending',
  in_progress: 'inProgress',
  completed: 'completed',
}
