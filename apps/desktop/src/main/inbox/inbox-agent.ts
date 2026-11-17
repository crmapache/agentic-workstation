import { basename } from 'node:path'

import type { InboxOrigin } from '@shared/inbox'

import { blankItem } from './inbox-items'
import { noticeOf, NoticeError } from './inbox-notice'
import type { NoticeButton } from './inbox-notice'
import type { InboxService } from './inbox-service'

/** Кто зовёт инструмент: проект процесса и разговор (вкладка панели или сессия прогона). */
export type AgentCaller = { projectPath: string; conversationId: string | null }

/** Чей разговор: прогон задания, вкладка панели или ничей; source - подпись уведомления. */
export type AgentOrigin = { origin: InboxOrigin; source: string }

export type AgentNotice = {
  title: string
  body: string
  attention: boolean
  at: string
  buttons: NoticeButton[]
}

/** Что ИИ видит о своих уведомлениях: list_notifications. */
export type AgentListed = {
  id: string
  title: string
  state: 'scheduled' | 'open' | 'done'
  deliverAt: string
  outcome: string
}

/**
 * Уведомления от ИИ: инструменты коннектора уведомлений зовут это, а не сервис напрямую. Чьё
 * уведомление - решает разговор, приславший его: только туда кнопка ответа вернёт нажатие.
 * Видны и отменяются только уведомления своего проекта.
 */
export class InboxAgent {
  constructor(
    private readonly inbox: InboxService,
    private readonly originOf: (caller: AgentCaller) => AgentOrigin,
    /** Прогон задания прислал уведомление: его отчёт о конце не нужен. */
    private readonly noted: (origin: InboxOrigin) => void,
  ) {}

  post(caller: AgentCaller, notice: AgentNotice): { id: string; deliverAt: string; note: string } {
    const { origin, source } = this.originOf(caller)
    const now = Date.now()
    const checked = noticeOf(notice, origin.kind !== 'none', now)
    const item = this.inbox.post(
      blankItem({
        kind: checked.deliverAt > now ? 'reminder' : 'message',
        title: checked.title,
        body: checked.body,
        tone: checked.tone,
        source: source || basename(caller.projectPath),
        projectPath: caller.projectPath,
        origin,
        actions: checked.actions,
        deliverAt: checked.deliverAt || now,
      }),
    )

    // Отчёт прогона заменяет только показанное сейчас: напоминание на завтра о сегодняшней
    // работе не говорит.
    if (item.arrivedAt > 0) this.noted(origin)

    return {
      id: item.id,
      deliverAt: new Date(item.deliverAt).toISOString(),
      note:
        item.arrivedAt > 0
          ? 'Shown to the person now.'
          : 'Scheduled: the person sees it at deliverAt (or as soon as the IDE is open after that).',
    }
  }

  cancel(caller: AgentCaller, id: string): { cancelled: boolean } {
    const item = this.inbox
      .all()
      .find((one) => one.id === id && one.projectPath === caller.projectPath)

    if (!item || (item.kind !== 'message' && item.kind !== 'reminder')) {
      throw new NoticeError(`No notification ${id} of this project`)
    }

    if (item.doneAt !== 0) return { cancelled: false }

    this.inbox.close(item.id, 'cancelled')

    return { cancelled: true }
  }

  list(caller: AgentCaller): AgentListed[] {
    return this.inbox
      .all()
      .filter(
        (item) =>
          item.projectPath === caller.projectPath &&
          (item.kind === 'message' || item.kind === 'reminder'),
      )
      .slice(0, 50)
      .map((item) => ({
        id: item.id,
        title: item.title,
        state: item.doneAt !== 0 ? 'done' : item.arrivedAt > 0 ? 'open' : 'scheduled',
        deliverAt: new Date(item.deliverAt).toISOString(),
        outcome: item.outcome,
      }))
  }
}

/**
 * Связь коннектора с уведомлениями: коннекторы поднимаются раньше уведомлений, поэтому агент
 * встаёт сюда позже. Нет агента - инструмент говорит модели подождать.
 */
export class InboxLink {
  agent: InboxAgent | null = null

  get ready(): InboxAgent {
    if (!this.agent)
      throw new NoticeError('Notifications are still starting. Try again in a moment.')

    return this.agent
  }
}
