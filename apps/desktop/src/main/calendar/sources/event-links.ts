import type { EventLink, EventPerson } from '@shared/calendar'
import { EVENT_LINKS_MAX, EVENT_PEOPLE_MAX } from '@shared/calendar'

import { urlsIn, httpsUrl, isCallUrl } from './join-url'

/** Имя, почта и подпись ссылки - короткие строки: длиннее на карточке всё равно не видно. */
const TEXT_MAX = 200

const clean = (value: string | null | undefined): string => value?.trim().slice(0, TEXT_MAX) ?? ''

/** Почта без «mailto:»; не похоже на почту - null. */
export const emailOf = (value: string | null | undefined): string | null => {
  const email = clean(value).replace(/^mailto:/i, '')

  return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null
}

/** Человек встречи: имя (нет - почта) и ссылка на него; ни имени, ни почты - null. */
export const personOf = (
  name: string | null | undefined,
  email: string | null | undefined,
  url: string | null = null,
): EventPerson | null => {
  const address = emailOf(email)
  const shown = clean(name) || address

  return shown ? { name: shown, email: address, url: httpsUrl(url) } : null
}

/** Люди без пустых и повторов (по почте, иначе по имени), не больше предела. */
export const peopleOf = (people: readonly (EventPerson | null)[]): EventPerson[] => {
  const seen = new Set<string>()

  return people
    .filter((person): person is EventPerson => {
      const id = (person?.email ?? person?.name ?? '').toLowerCase()

      if (!person || seen.has(id)) return false

      seen.add(id)

      return true
    })
    .slice(0, EVENT_PEOPLE_MAX)
}

/** Подпись ссылки без своей подписи: хост, а у документа - и начало пути. */
const labelOf = (url: string): string => {
  const { hostname, pathname } = new URL(url)
  const host = hostname.replace(/^www\./, '')
  const path = pathname.length > 1 ? pathname.slice(0, 24) : ''

  return `${host}${path}${pathname.length > 25 ? '…' : ''}`
}

/**
 * Прочие ссылки встречи: свои (вложения - с подписью) и найденные в текстах (описание), только
 * https, без звонков и уже показанных отдельно (skip), без повторов, не больше предела.
 */
export const linksOf = (
  own: readonly { label?: string | null | undefined; url: string | null | undefined }[],
  texts: readonly (string | null | undefined)[],
  skip: readonly (string | null)[],
): EventLink[] => {
  const taken = new Set(skip.filter((url) => url !== null))
  const links: EventLink[] = []
  const found: { label?: string | null | undefined; url: string | null | undefined }[] = [
    ...own,
    ...texts.flatMap((text) => urlsIn(text).map((url) => ({ url }))),
  ]

  for (const { label, url: raw } of found) {
    const url = httpsUrl(raw)

    if (!url || taken.has(url) || isCallUrl(url)) continue

    taken.add(url)
    links.push({ label: clean(label) || labelOf(url), url })

    if (links.length >= EVENT_LINKS_MAX) break
  }

  return links
}

/** Место - само ссылка (не звонок): её и открывать. */
export const locationUrlOf = (location: string | null | undefined): string | null => {
  const url = httpsUrl(location)

  return url && !isCallUrl(url) ? url : null
}
