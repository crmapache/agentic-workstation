import type { TFunction } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import { Cloud, CloudOff, CloudAlert, CloudCheck, CloudUpload } from 'lucide-react'

import type { CloudState, CloudStatus, CloudKeyCode } from '@shared/tracker'

/** Значок облака по состоянию: синхронно - галочка, в пути - стрелка, нет связи - зачёркнуто. */
export const cloudIcon = (status: CloudStatus): LucideIcon =>
  status === 'synced'
    ? CloudCheck
    : status === 'syncing'
      ? CloudUpload
      : status === 'error'
        ? CloudAlert
        : status === 'offline' || status === 'off'
          ? CloudOff
          : Cloud

/** Аккаунт на этой машине есть: его ключ можно показать. Пропавший ключ - аккаунта нет. */
export const hasAccount = (cloud: CloudState): boolean =>
  cloud.accountId !== null && cloud.failure !== 'keyLost'

/**
 * Отказ с ключом словами окна; undefined - сказать нечего: «нет» в системном окне подтверждения
 * - решение человека, а не ошибка, поле просто остаётся как было.
 */
export const keyFailureText = (t: TFunction, code: CloudKeyCode | null): string | undefined =>
  code === 'badKey'
    ? t('tracker.cloud.badKey')
    : code === 'noKeychain'
      ? t('tracker.cloud.failure.noKeychain')
      : undefined
