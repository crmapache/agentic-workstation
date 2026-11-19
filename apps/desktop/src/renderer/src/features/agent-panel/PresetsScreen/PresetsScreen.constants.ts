import type { SettingsScreen } from '../panel.types'

/** Сколько кнопок можно поставить под полем: ни одной и до трёх (ADR 0096). */
export const PRESET_COUNTS: readonly number[] = [0, 1, 2, 3]

/** Экран каждого пресета по номеру кнопки: один вид на три экрана, различие - номер. */
export const PRESET_SCREENS: readonly Extract<SettingsScreen, 'preset1' | 'preset2' | 'preset3'>[] =
  ['preset1', 'preset2', 'preset3']
