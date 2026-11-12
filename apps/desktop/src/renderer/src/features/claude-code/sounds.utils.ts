import type { ConversationCall } from '@shared/claude-prefs'
import type { SoundEvent } from '@shared/sounds'
import { SOUND_PRIORITY } from '@shared/sounds'

import { SOUND_GAP_MS } from './sounds.constants'

/** Последний сыгравший звук: когда и насколько он был важен. */
export type LastSound = { at: number; rank: number }

/** Важность повода: меньше - важнее (SOUND_PRIORITY). */
export const soundRank = (event: SoundEvent): number => SOUND_PRIORITY.indexOf(event)

/**
 * Слышен ли звук сразу за предыдущим. Подряд молчит менее важный, а не тот, что опоздал
 * на миллисекунду: два сигнала подряд лучше, чем не услышать главный.
 */
export const passesGap = (last: LastSound | null, event: SoundEvent, now: number): boolean =>
  last === null || now - last.at >= SOUND_GAP_MS || soundRank(event) < last.rank

/**
 * Смотрит ли человек прямо на эту вкладку: окно впереди, панель Claude Code открыта и
 * вкладка выбрана в активном проекте. Тогда звать звуком незачем - ровно туда он и
 * смотрит. Фоновая вкладка, свёрнутое окно, закрытая панель - звук нужен.
 */
export const isWatched = (
  call: ConversationCall,
  view: { activeConversationId: string | null; panelShown: boolean; windowFocused: boolean },
): boolean =>
  view.windowFocused && view.panelShown && view.activeConversationId === call.conversationId
