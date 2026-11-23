import { clsx } from 'clsx'
import { Video, ExternalLink, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Popover } from '@agentic-workstation/ui/Popover'
import { useAnchoredPopover } from '@agentic-workstation/ui/Popover.hooks'

import styles from './EventCard.module.scss'
import type { EventCardProps } from './EventCard.types'
import { clashesOf, whenLabel } from './EventCard.utils'

/**
 * Карточка встречи рядом с её блоком: когда, из каких календарей, мой ответ, где и кто
 * организатор, с чем накладывается. Join и «открыть в календаре» - ссылками: окно отдаёт их
 * браузеру человека.
 */
export const EventCard = ({ opened, meetings, overlaps, sources, onClose }: EventCardProps) => {
  const { t } = useTranslation()
  const popover = useAnchoredPopover(opened.anchor, onClose)
  const { event, sourceIds } = opened.meeting
  const clashes = clashesOf(opened.meeting, meetings, overlaps)
  const sourceOf = (id: string) => sources.find((source) => source.id === id)

  return (
    <Popover {...popover} width="md">
      <div className={styles.card}>
        <div className={styles.title}>{event.title || t('calendar.event.noTitle')}</div>
        <div className={styles.when}>{whenLabel(event)}</div>
        <ul className={styles.sources}>
          {sourceIds.map((id) => (
            <li key={id} className={styles.source}>
              <span className={clsx(styles.dot, styles[`tone${sourceOf(id)?.color ?? 0}`])} />
              {sourceOf(id)?.name ?? id}
            </li>
          ))}
        </ul>
        <dl className={styles.facts}>
          {event.response !== 'unknown' && (
            <>
              <dt>{t('calendar.event.response')}</dt>
              <dd>{t(`calendar.responses.${event.response}`)}</dd>
            </>
          )}
          {event.status !== 'confirmed' && (
            <>
              <dt>{t('calendar.event.status')}</dt>
              <dd>{t(`calendar.statuses.${event.status}`)}</dd>
            </>
          )}
          {event.location && (
            <>
              <dt>{t('calendar.event.location')}</dt>
              <dd>{event.location}</dd>
            </>
          )}
          {event.organizer && (
            <>
              <dt>{t('calendar.event.organizer')}</dt>
              <dd>{event.organizer}</dd>
            </>
          )}
        </dl>
        {clashes.length > 0 && (
          <div className={styles.clash}>
            <TriangleAlert className={styles.clashIcon} aria-hidden />
            {t('calendar.event.clashes', {
              titles: clashes
                .map((one) => one.event.title || t('calendar.event.noTitle'))
                .join(', '),
            })}
          </div>
        )}
        {(event.joinUrl || event.link) && (
          <div className={styles.actions}>
            {event.joinUrl && (
              <a
                className={clsx(styles.link, styles.join)}
                href={event.joinUrl}
                target="_blank"
                rel="noreferrer">
                <Video className={styles.linkIcon} aria-hidden />
                {t('calendar.event.join')}
              </a>
            )}
            {event.link && (
              <a className={styles.link} href={event.link} target="_blank" rel="noreferrer">
                <ExternalLink className={styles.linkIcon} aria-hidden />
                {t('calendar.event.open')}
              </a>
            )}
          </div>
        )}
      </div>
    </Popover>
  )
}
