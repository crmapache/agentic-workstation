import type { EventFormat } from '@shared/calendar'

/**
 * Место, которое значит звонок, а не адрес: сервис звонков словом («Microsoft Teams Meeting»,
 * «Zoom»), «онлайн», телефон. Слова - на языках календарей человека: английский, испанский,
 * русский.
 */
const CALL_PLACE =
  /\b(?:teams|zoom|google meet|hangouts?|webex|skype|whereby|jitsi|gotomeeting|online|virtual|remote|phone|call|dial-in|videollamada|llamada|en l[ií]nea|remot[ao])\b|онлайн|звонок|созвон|телефон|видеосвяз/i

/** Место - номер телефона: «+1 (555) 010-0000». */
const PHONE = /^\+?[\d\s().-]{7,}$/

const URL_PLACE = /^https?:\/\//i

/** Карты без «maps» в адресе; остальные узнаются по хосту maps.* или пути /maps. */
const MAP_HOSTS = ['waze.com', 'openstreetmap.org', '2gis.com', '2gis.ru'] as const

/** Ссылка на карту - место, куда идти. */
const isMapUrl = (place: string): boolean => {
  try {
    const { hostname, pathname } = new URL(place)
    const host = hostname.replace(/^www\./, '')

    return (
      host.startsWith('maps.') ||
      pathname.startsWith('/maps') ||
      MAP_HOSTS.some((map) => host === map || host.endsWith(`.${map}`))
    )
  } catch {
    return false
  }
}

/**
 * Как проходит встреча. Ссылка на звонок - звонок всегда: кнопка Join и слово карточки не
 * спорят. Дальше - слово ИИ, который видел встречу (said), а без него - место: «Teams», «онлайн»,
 * телефон - звонок; адрес, комната, ссылка на карту - лично; ни места, ни ссылки (или место -
 * ссылка не на карту) - не сказано: угадывать по названию не беремся.
 */
export const eventFormatOf = (
  joinUrl: string | null,
  location: string | null,
  said: EventFormat = 'unknown',
): EventFormat => {
  if (joinUrl) return 'call'
  if (said !== 'unknown') return said

  const place = location?.trim() ?? ''

  if (!place) return 'unknown'
  if (CALL_PLACE.test(place) || PHONE.test(place)) return 'call'
  if (URL_PLACE.test(place)) return isMapUrl(place) ? 'in-person' : 'unknown'

  return 'in-person'
}
