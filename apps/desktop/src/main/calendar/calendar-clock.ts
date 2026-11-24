import type { InboxItem } from '@shared/inbox'
import { MINUTE_MS, SECOND_MS } from '@shared/time-units'

import { staleCard, morningDue, morningPlan } from './calendar-morning'
import { dueReminders, reminderCard } from './calendar-reminders'
import type { CalendarService } from './calendar-service'
import type { CalendarSync } from './calendar-sync'

/** Тик часов: напоминание приходит не позже полуминуты после срока. */
const TICK_MS = 30 * SECOND_MS

/**
 * Часы календаря (ADR 0116): раз в полминуты - напоминания о звонках и утренний синк. Один
 * таймер на оба: оба смотрят на время и настройки, а не на события синка.
 */
export class CalendarClock {
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false

  constructor(
    private readonly service: CalendarService,
    private readonly sync: CalendarSync,
    private readonly post: (item: InboxItem) => void,
    private readonly now: () => number = () => Date.now(),
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref()
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** Один шаг часов; следующий не встаёт, пока не дописан этот (запись на диск). */
  async tick(): Promise<void> {
    if (this.ticking) return

    this.ticking = true

    try {
      const now = this.now()

      await this.remind(now)
      await this.morning(now)
    } finally {
      this.ticking = false
    }
  }

  private async remind(now: number): Promise<void> {
    const { reminders } = this.service.settings
    const horizon = now + (Math.max(0, ...reminders) + 1) * MINUTE_MS
    const { meetings } = this.service.meetingsIn(now - MINUTE_MS, horizon)
    const { due, reminded } = dueReminders(meetings, reminders, this.service.marks.reminded, now)
    const changed =
      JSON.stringify(Object.keys(reminded)) !==
      JSON.stringify(Object.keys(this.service.marks.reminded))

    for (const one of due) this.post(reminderCard(one, this.service.sources))

    if (changed) await this.service.setMarks({ reminded })
  }

  private async morning(now: number): Promise<void> {
    const { settings } = this.service
    const today = morningDue(settings, this.service.marks.morningOn, now)

    if (!today) return

    const { read, remind } = morningPlan(
      settings,
      this.service.sources,
      (id) => this.service.lastOkAt(id),
      now,
    )

    this.sync.syncMorning(read)

    if (remind.length) this.post(staleCard(remind))

    await this.service.setMarks({ morningOn: today })
  }
}
