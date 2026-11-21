import type { NoticeCode, NoticeExtra, ClosedReason } from '@shared/conversation-feed'

import type { FeedStore } from '../../agents/feed/feed-store'
import { AgentTasks } from './agent-tasks'
import { WakeupWatch } from './wakeup-watch'

/** Как фон ставит отметку в ленту: сборщик знает id и replay, фон - нет. */
type AddNotice = (code: NoticeCode, detail: string, extra: NoticeExtra) => void

/**
 * Фон процесса CLI - всё, что живёт в нём дольше хода: субагенты и флоты workflow, фоновые
 * команды (события task_*) и будильник, который агент поставил себе. Всё это умирает вместе
 * с процессом. Агента закрывает его карточка; команда и будильник пропали бы молча, поэтому о
 * них - отметка в ленте: иначе разговор ждал бы отчёта или пробуждения, которых не будет.
 */
export class ProcessBackground {
  readonly agents: AgentTasks
  readonly wakeup: WakeupWatch

  constructor(
    store: FeedStore,
    private readonly addNotice: AddNotice,
    isLive: () => boolean,
  ) {
    this.agents = new AgentTasks(store)
    this.wakeup = new WakeupWatch(store, isLive)
  }

  /** Процесс ушёл: reason - почему (умер сам или заменён нарочно). */
  release(reason: ClosedReason, at: number): void {
    for (const name of this.agents.release(reason, at)) {
      this.addNotice('command-lost', name, { subject: reason })
    }

    const dueAt = this.wakeup.release(at)

    if (dueAt !== null) this.addNotice('wakeup-lost', String(dueAt), { subject: reason })
  }

  /** Забыть учёт, не трогая ленту: транскрипт прочитан, страница истории собрана. */
  forget(): void {
    this.agents.forget()
    this.wakeup.forget()
  }
}
