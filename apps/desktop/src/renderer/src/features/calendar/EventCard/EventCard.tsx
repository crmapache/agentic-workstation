import { clsx } from 'clsx'
import { Video, MapPin, CalendarDays, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Popover } from '@agentic-workstation/ui/Popover'
import { useAnchoredPopover } from '@agentic-workstation/ui/Popover.hooks'

import styles from './EventCard.module.scss'
import type { EventCardProps } from './EventCard.types'
import { clashesOf, whenLabel, durationLabel } from './EventCard.utils'
import { ClashAlert } from './parts/ClashAlert'
import { FactRow } from './parts/FactRow'
import { LinkText } from './parts/LinkText'
import { PeopleFacts } from './parts/PeopleFacts'
import { ResponseFact } from './parts/ResponseFact'

/**
 * Карточка встречи рядом с её блоком: когда и сколько, из каких календарей, мой ответ, где, кто
 * организует и кто приглашён, ссылки встречи; накладки - с «видел» и «Ask AI». Join и «открыть
 * в календаре» - справа внизу, ссылками: окно отдаёт их браузеру человека.
 */
export const EventCard = ({
  opened,
  meetings,
  overlaps,
  seen,
  sources,
  onClose,
}: EventCardProps) => {
  const { t } = useTranslation()
  const popover = useAnchoredPopover(opened.anchor, onClose)
  const { event, sourceIds } = opened.meeting
  const clashes = clashesOf(opened.meeting, meetings, overlaps)
  const sourceOf = (id: string) => sources.find((source) => source.id === id)

  return (
    <Popover {...popover} width="md">
      <div className={styles.card}>
        <div className={styles.head}>
          <div className={styles.title}>{event.title || t('calendar.event.noTitle')}</div>
          <div className={styles.when}>
            {whenLabel(event)}
            {!event.allDay && ` · ${durationLabel(event.end - event.start)}`}
          </div>
        </div>
        <ul className={styles.facts}>
          <FactRow icon={CalendarDays} label={t('calendar.event.calendars')}>
            <span className={styles.sources}>
              {sourceIds.map((id) => (
                <span key={id} className={styles.source}>
                  <span className={clsx(styles.dot, styles[`tone${sourceOf(id)?.color ?? 0}`])} />
                  {sourceOf(id)?.name ?? id}
                </span>
              ))}
            </span>
          </FactRow>
          <ResponseFact event={event} />
          {event.location && (
            <FactRow icon={MapPin} label={t('calendar.event.location')}>
              <LinkText text={event.location} url={event.locationUrl} />
            </FactRow>
          )}
          <PeopleFacts event={event} />
        </ul>
        {clashes.map(({ overlap, meeting }) => (
          <ClashAlert
            key={overlap.key}
            overlap={overlap}
            meeting={meeting}
            seen={seen.includes(overlap.key)}
            source={sourceOf(meeting.sourceIds[0] ?? '')?.name ?? ''}
          />
        ))}
        {(event.joinUrl || event.link) && (
          <div className={styles.actions}>
            {event.link && (
              <a className={styles.action} href={event.link} target="_blank" rel="noreferrer">
                <ExternalLink className={styles.actionIcon} aria-hidden />
                {t('calendar.event.open')}
              </a>
            )}
            {event.joinUrl && (
              <a
                className={clsx(styles.action, styles.join)}
                href={event.joinUrl}
                target="_blank"
                rel="noreferrer">
                <Video className={styles.actionIcon} aria-hidden />
                {t('calendar.event.join')}
              </a>
            )}
          </div>
        )}
      </div>
    </Popover>
  )
}
