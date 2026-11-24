import type { CalendarSource } from '@shared/calendar'
import type { CalendarMeeting } from '@shared/calendar-overlaps'
import type { OverlapView } from '@shared/calendar-review'
import type { InboxItem } from '@shared/inbox'

import { action, blankItem } from '../inbox/inbox-items'

/** Сколько накладок перечислять в карточке: дальше - «и ещё N», полный список - в календаре. */
const LISTED_MAX = 5

/**
 * Какие накладки впереди - новые: их ключа нет среди объявленных. Объявленные помнятся до
 * конца своего отрезка, прошедшие забываются.
 */
export const overlapNews = <T extends Pick<OverlapView, 'key' | 'end'>>(
  upcoming: readonly T[],
  notified: Readonly<Record<string, number>>,
  now: number,
): { fresh: T[]; notified: Record<string, number> } => {
  const kept = Object.fromEntries(Object.entries(notified).filter(([, end]) => end > now))
  const fresh = upcoming.filter((overlap) => overlap.end > now && !(overlap.key in kept))

  for (const overlap of upcoming) kept[overlap.key] = Math.max(kept[overlap.key] ?? 0, overlap.end)

  return { fresh, notified: kept }
}

/** Часы - 24-часовые, как везде в IDE. */
const when = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const until = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const titleOf = (meeting: CalendarMeeting) => meeting.event.title || '(No title)'

/**
 * Карточка о новых накладках - одна на синк, со списком и кнопкой «открыть календарь».
 * Названия встреч - из календарей человека, это его же лента.
 */
export const overlapCard = (
  fresh: readonly OverlapView[],
  sources: readonly CalendarSource[],
): InboxItem => {
  const nameOf = (meeting: CalendarMeeting) =>
    sources.find((source) => source.id === meeting.sourceIds[0])?.name ?? ''
  const line = (overlap: OverlapView) => {
    const { a, b } = overlap

    return `- **${when.format(overlap.start)} - ${until.format(overlap.end)}**: ${titleOf(a)} (${nameOf(a)}) and ${titleOf(b)} (${nameOf(b)})${overlap.soft ? ', one is tentative' : ''}`
  }
  const more = fresh.length - LISTED_MAX

  return blankItem({
    kind: 'message',
    tone: 'attention',
    title: fresh.length === 1 ? 'Calls overlap' : `${fresh.length} call overlaps`,
    body: [
      ...fresh.slice(0, LISTED_MAX).map(line),
      ...(more > 0 ? [`- and ${more} more`] : []),
    ].join('\n'),
    source: 'Calendar',
    actions: [action('showCalendar', { primary: true })],
  })
}
