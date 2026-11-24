import { Link2, Users, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { GUESTS_SHOWN } from '../EventCard.constants'
import styles from '../EventCard.module.scss'
import type { EventFactProps } from '../EventCard.types'
import { FactRow } from './FactRow'
import { LinkText } from './LinkText'

/**
 * Люди и ссылки встречи: организатор (я - «you»), гости по именам с «и ещё N», прочие ссылки.
 * Имя со ссылкой (профиль, чат) открывается в браузере, почта - рядом, чтобы скопировать.
 */
export const PeopleFacts = ({ event }: EventFactProps) => {
  const { t } = useTranslation()
  const { organizer, attendees, links } = event
  const more = attendees.length - GUESTS_SHOWN
  const email = organizer?.email && organizer.email !== organizer.name ? organizer.email : ''
  // Разделители - строкой, а не текстом в разметке: их держит i18n вместе со словами.
  const organizerNote = ` · ${[email, t('calendar.event.organizerTag')].filter(Boolean).join(' · ')}`
  const guestsLabel = `${t('calendar.event.guests', { count: attendees.length })}: `

  return (
    <>
      {organizer && (
        <FactRow icon={UserRound} label={t('calendar.event.organizer')}>
          {event.response === 'organizer' ? (
            <span>{t('calendar.event.youOrganize')}</span>
          ) : (
            <>
              <LinkText text={organizer.name} url={organizer.url} />
              <span className={styles.subtle}>{organizerNote}</span>
            </>
          )}
        </FactRow>
      )}
      {attendees.length > 0 && (
        <FactRow icon={Users} label={t('calendar.event.guests', { count: attendees.length })}>
          <span className={styles.subtle}>{guestsLabel}</span>
          {attendees.slice(0, GUESTS_SHOWN).map((person, index) => (
            <span key={`${person.email ?? person.name}-${index}`}>
              {index > 0 && ', '}
              <LinkText text={person.name} url={person.url} />
            </span>
          ))}
          {more > 0 && (
            <span className={styles.subtle}> {t('calendar.event.more', { count: more })}</span>
          )}
        </FactRow>
      )}
      {links.length > 0 && (
        <FactRow icon={Link2} label={t('calendar.event.links')}>
          {links.map((link, index) => (
            <span key={link.url}>
              {index > 0 && ' · '}
              <LinkText text={link.label} url={link.url} />
            </span>
          ))}
        </FactRow>
      )}
    </>
  )
}
