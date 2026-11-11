import type { ConnectorFailure } from '@shared/connectors'

import { GMAIL_API, CALENDAR_API } from './google.constants'

export type GoogleCheck = { account: string } | { failure: ConnectorFailure }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * API выключен в проекте клиента: Google отвечает 403 с причиной SERVICE_DISABLED или
 * словами «has not been used / is disabled». Это шаг настройки, а не сбой входа.
 */
export const isApiDisabled = (body: unknown): boolean => {
  const error = isRecord(body) ? body['error'] : null

  if (!isRecord(error)) return false

  const message = typeof error['message'] === 'string' ? error['message'] : ''
  const details = Array.isArray(error['details']) ? error['details'] : []
  const disabled = details.some(
    (detail) => isRecord(detail) && detail['reason'] === 'SERVICE_DISABLED',
  )

  return disabled || /has not been used|is disabled/i.test(message)
}

/**
 * Чей вход и работает ли API - до того, как токены лягут в хранилище: вход, с которым
 * не работает ни один вызов, хранить незачем. Gmail - адрес ящика, Calendar - id основного
 * календаря (это тот же адрес).
 */
export const checkGoogleAccount = async (
  kind: 'gmail' | 'calendar',
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<GoogleCheck> => {
  const url = kind === 'gmail' ? `${GMAIL_API}/profile` : `${CALENDAR_API}/calendars/primary`
  const response = await fetchFn(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const body: unknown = await response.json().catch(() => null)

  if (response.status === 403 && isApiDisabled(body)) return { failure: 'google-api-disabled' }

  const account = isRecord(body) ? body[kind === 'gmail' ? 'emailAddress' : 'id'] : null

  return response.ok && typeof account === 'string' ? { account } : { failure: 'sign-in-failed' }
}
