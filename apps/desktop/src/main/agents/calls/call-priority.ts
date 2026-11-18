import type { SoundEvent } from '@shared/sounds'
import { SOUND_PRIORITY } from '@shared/sounds'

/**
 * Главный из поводов одной вкладки: ход, оборванный отказом, приносит и ошибку, и
 * конец хода сразу - звучать должно важное, а не два сигнала поверх друг друга.
 */
export const strongestCall = (reasons: ReadonlySet<SoundEvent>): SoundEvent | null =>
  SOUND_PRIORITY.find((reason) => reasons.has(reason)) ?? null
