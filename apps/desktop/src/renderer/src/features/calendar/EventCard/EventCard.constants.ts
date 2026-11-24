import type { LucideIcon } from 'lucide-react'
import { CircleX, CircleCheck, CircleDashed, CircleQuestionMark } from 'lucide-react'

import type { EventResponse } from '@shared/calendar'

/** Гостей по именам в карточке; дальше - «и ещё N». */
export const GUESTS_SHOWN = 5

/** Разделитель частей строки карточки: время и длительность, ответ и состояние. */
export const SEPARATOR = ' · '

/** Значок ответа: да, под вопросом, нет, неизвестно. */
export const RESPONSE_ICONS: Record<EventResponse, LucideIcon> = {
  accepted: CircleCheck,
  organizer: CircleCheck,
  tentative: CircleQuestionMark,
  pending: CircleQuestionMark,
  declined: CircleX,
  unknown: CircleDashed,
}
