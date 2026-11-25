import {
  Bell,
  AlarmClock,
  FileCheck2,
  ListChecks,
  CircleAlert,
  ShieldQuestion,
  MessageCircleQuestion,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { InboxKind } from '@shared/inbox'

import type { InboxTab } from './inbox.types'

export const KIND_ICONS: Record<InboxKind, LucideIcon> = {
  question: MessageCircleQuestion,
  permission: ShieldQuestion,
  plan: ListChecks,
  report: FileCheck2,
  failure: CircleAlert,
  message: Bell,
  reminder: AlarmClock,
}

export const INBOX_TABS: readonly InboxTab[] = ['open', 'scheduled', 'done']

/** Отчёт и сообщение уходят из угла окна сами - всё есть на виде; вопрос ждёт ответа. */
export const TOAST_HIDE_MS = 8_000

/** Открытое на виде считается прочитанным не сразу: мельком пролистанное - ещё не прочитано. */
export const READ_AFTER_MS = 1_500

/** Сколько подсвечено уведомление, к которому привёл баннер ОС. */
export const REVEAL_MS = 2_500

/** Суть в карточке угла окна - не длиннее. */
export const PREVIEW_MAX = 160

/** Строк сути в карточке угла окна - не больше: остальное на виде уведомлений. */
export const PREVIEW_LINES = 3

/** Как часто стареют подписи времени карточек («Today» → «Yesterday»). */
export const CLOCK_TICK_MS = 60_000
