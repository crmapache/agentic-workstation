import type { MenuScreen } from '../panel.types'

/** Какой пресет правит экран: один вид на три экрана, различие - номер кнопки. */
export const PRESET_OF_SCREEN: Partial<Record<MenuScreen, number>> = {
  preset1: 0,
  preset2: 1,
  preset3: 2,
}
