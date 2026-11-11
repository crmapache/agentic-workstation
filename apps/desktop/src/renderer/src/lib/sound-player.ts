import type { SoundEvent } from '@shared/sounds'

import extraUsage from './sounds/extra-usage.wav'
import permission from './sounds/permission.wav'
import plan from './sounds/plan.wav'
import question from './sounds/question.wav'
import limit from './sounds/rate-limit.wav'
import error from './sounds/trouble.wav'
import turnDone from './sounds/turn-finished.wav'

/** Файл каждого повода - звуки ACC: набор звуков - часть IDE, а не настройки человека. */
const SOUND_FILES: Record<SoundEvent, string> = {
  turnDone,
  permission,
  question,
  plan,
  limit,
  extraUsage,
  error,
}

/**
 * Сыграть звук повода. Громкость в процентах - доля амплитуды, как в ACC (там - усиление
 * в децибелах, 20·log10 доли): половина процентов - «чуть тише», а не «вдвое тише».
 * Автозапуск звука Electron разрешает без жеста. Не сыграл (нет устройства) - звук не
 * стоит того, чтобы ронять окно.
 */
export const playSound = (event: SoundEvent, volume: number): void => {
  if (volume <= 0) return

  const audio = new Audio(SOUND_FILES[event])

  audio.volume = Math.min(1, volume / 100)
  audio.play().catch((error: unknown) => console.warn('[sounds] звук не сыграл:', error))
}
