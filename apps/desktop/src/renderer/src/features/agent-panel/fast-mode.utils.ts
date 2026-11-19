import type { TFunction } from 'i18next'

import type { FastModeShown } from '@shared/fast-mode'

import { FAST_REASON_KEYS } from './NoticeRow/NoticeRow.constants'

/** /fast, /fast on, /fast off: что просит каждая при том, что попрошено сейчас. */
export const fastAsked = (argument: string, now: boolean | undefined): boolean => {
  const word = argument.trim().toLowerCase()

  if (word === 'on') return true
  if (word === 'off') return false

  return !now
}

/** Почему быстрый режим не работает - словами панели, незнакомое слово CLI - общими. */
const fastReasonText = (reason: string, t: TFunction): string => {
  const key = FAST_REASON_KEYS[reason]

  return key ? t(key) : t('agentPanel.notice.fast.reasons.unknown')
}

/** Строка под переключателем «Fast mode» в меню MODEL. */
export const fastModeSub = (shown: FastModeShown, t: TFunction): string => {
  switch (shown.kind) {
    case 'off':
      return t('agentPanel.fast.offSub')
    case 'waiting':
      return t('agentPanel.fast.waitingSub')
    case 'on':
      return shown.fromSettings ? t('agentPanel.fast.onSettingsSub') : t('agentPanel.fast.onSub')
    case 'cooldown':
      return t('agentPanel.fast.cooldownSub')
    case 'unavailable':
      return t('agentPanel.fast.unavailableSub', { reason: fastReasonText(shown.reason, t) })
  }
}

/** Подсказка знака ↯ на MODEL: что с быстрым режимом сейчас; пусто - знака нет. */
export const fastChipHint = (shown: FastModeShown, t: TFunction): string => {
  switch (shown.kind) {
    case 'off':
      return ''
    case 'waiting':
      return t('agentPanel.fast.chipWaiting')
    case 'on':
      return shown.fromSettings ? t('agentPanel.fast.chipOnSettings') : t('agentPanel.fast.chipOn')
    case 'cooldown':
      return t('agentPanel.fast.chipCooldown')
    case 'unavailable':
      return t('agentPanel.fast.chipUnavailable', { reason: fastReasonText(shown.reason, t) })
  }
}
