import { RELAY_URL, RELAY_URL_ENV } from './remote.constants'

/**
 * Адрес релея. Переменная окружения - только у несобранной IDE (разработка, тесты): у
 * установленной её подставил бы кто угодно, кто запускает приложение, и IDE звонила бы с
 * ключами пар на чужой сервер.
 */
export const relayUrlFor = (env: Readonly<Record<string, string | undefined>>, packaged: boolean) =>
  (!packaged && env[RELAY_URL_ENV]) || RELAY_URL
