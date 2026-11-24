/** Сервисы звонков: ссылка на них в событии - кнопка Join на карточке. */
const CALL_HOSTS = [
  'meet.google.com',
  'zoom.us',
  'zoom.com',
  'teams.microsoft.com',
  'teams.live.com',
  'webex.com',
  'whereby.com',
  'gotomeeting.com',
  'chime.aws',
  'meet.jit.si',
  'around.co',
  'bluejeans.com',
] as const

const URL_IN_TEXT = /https:\/\/[^\s<>"')\]]+/g

/** Адрес https, если строка - он; иначе null. */
export const httpsUrl = (value: string | null | undefined): string | null => {
  if (!value) return null

  try {
    const url = new URL(value.trim())

    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

const isCallHost = (host: string): boolean =>
  CALL_HOSTS.some((call) => host === call || host.endsWith(`.${call}`))

/** Ссылка ли это на звонок: известный сервис звонков. */
export const isCallUrl = (url: string): boolean => {
  try {
    return isCallHost(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Адреса https в тексте, по порядку. */
export const urlsIn = (text: string | null | undefined): string[] => text?.match(URL_IN_TEXT) ?? []

/**
 * Ссылка на звонок из полей события по порядку (поле конференции, место, описание): первая
 * https-ссылка на известный сервис звонков. Прочие ссылки (документы, карты) - не звонок.
 */
export const joinUrlIn = (texts: readonly (string | null | undefined)[]): string | null => {
  for (const text of texts) {
    for (const match of urlsIn(text)) {
      const url = httpsUrl(match)

      if (url && isCallUrl(url)) return url
    }
  }

  return null
}
