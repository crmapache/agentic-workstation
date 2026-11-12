import type { DeviceKind } from './PairingScreen.types'

/** Что за телефон - для имени по умолчанию в списке телефонов IDE. */
export const deviceKindOf = (userAgent: string): DeviceKind => {
  if (/iPhone/.test(userAgent)) return 'iphone'
  if (/iPad/.test(userAgent)) return 'ipad'
  if (/Android/.test(userAgent)) return 'android'

  return 'other'
}

/** После какого отказа можно нажать «Pair» снова: код в IDE не потрачен, только если не дошли. */
export const canRetry = (reason: string): boolean => reason === 'offline'
