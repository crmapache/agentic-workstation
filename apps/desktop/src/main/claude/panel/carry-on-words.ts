import type { CarryOnReason } from '@shared/panel-extras'
import { CARRY_ON_REASONS } from '@shared/panel-extras'

import type { Owed } from './carry-ons'
import { CARRY_ON_TAG } from './panel.constants'

/**
 * Что панель говорит в разговор сама, когда работа встала по ничьей причине (как в ACC,
 * CarryOnWords). Слова говорят агенту правду: прерывание - смена аккаунта, а не просьба
 * остановиться; лимит сбросился или разговор переехал; фоновые агенты погибли. Интерфейс
 * IDE только английский - и слова тоже.
 */

const AFTER_ACCOUNT_SWITCH =
  'The interruption above was an automatic switch to another account, not a request to stop. ' +
  'Carry on from where you stopped. Anything you had running in the background did not survive ' +
  'the switch: start again whatever you still need.'

const AFTER_LIMIT = 'The usage limit that stopped you has reset. Carry on from where you stopped.'

const AFTER_LIMIT_MOVED =
  'The usage limit stopped you, and this conversation has since moved to another account. ' +
  'Carry on from where you stopped.'

const AFTER_RESTART =
  'Claude Code was restarted under this conversation, and the agents you had working in the ' +
  'background did not survive it. Start again whatever you still need of them, and carry on.'

const HELPERS_LOST =
  'Anything you had running in the background did not survive a restart of Claude Code: start ' +
  'again whatever you still need.'

/** Слова для долга - без тега. */
export const carryOnWords = (owed: Owed): string => {
  if (owed.reason === 'accountSwitch') return AFTER_ACCOUNT_SWITCH
  if (owed.reason === 'restart') return AFTER_RESTART

  const limit = owed.moved ? AFTER_LIMIT_MOVED : AFTER_LIMIT

  return owed.helpersLost ? `${limit} ${HELPERS_LOST}` : limit
}

/**
 * Слова, как их получает агент: в теге с причиной. Только тег говорит, чьё это, когда
 * осталась строка транскрипта: лента из истории рисует карточку PANEL, а не YOU.
 */
export const forAgent = (reason: CarryOnReason, words: string): string =>
  `<${CARRY_ON_TAG} reason="${reason}">${words}</${CARRY_ON_TAG}>`

const TAGGED = new RegExp(`^<${CARRY_ON_TAG} reason="([\\w-]*)">([\\s\\S]*)</${CARRY_ON_TAG}>$`)

/**
 * Сообщение панели из строки транскрипта: причина и слова. Причина из более новой версии -
 * unknown: за неё не ручаемся. null - это сообщение человека.
 */
export const parseCarryOn = (
  text: string,
): { reason: CarryOnReason | 'unknown'; words: string } | null => {
  const match = TAGGED.exec(text.trim())

  if (!match) return null

  const reason = CARRY_ON_REASONS.find((known) => known === match[1]) ?? 'unknown'

  return { reason, words: match[2] ?? '' }
}
