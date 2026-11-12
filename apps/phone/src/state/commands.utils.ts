import type { TFunction } from 'i18next'

import { CommandError } from './command-error'

/** Слова отказа: код IDE, а у отказа сценариев - его собственный код (queueBusy, untrusted…). */
export const failureText = (t: TFunction, error: unknown): string => {
  if (!(error instanceof CommandError)) return t('errors.failed')
  if (error.code === 'refused' && error.detail) {
    return t(`errors.refusedBecause.${error.detail}`, { defaultValue: t('errors.refused') })
  }

  return t(`errors.${error.code}`, { defaultValue: t('errors.failed') })
}
