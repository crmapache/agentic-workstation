import type { MouseEvent } from 'react'

import { AREA_CONTROLS } from './Card.constants'

/**
 * Нажатие по самой площади (карточка с onPress, строка списка, которая открывает своё), а не по
 * её кнопке, не из портала (меню и окна внутри площади всплывают сюда через React) и не конец
 * выделения текста. Только такое ведёт туда, куда ведёт площадь. Клавиатуре площадь не нужна:
 * то же действие у главной кнопки внутри.
 */
export const isAreaPress = (event: MouseEvent<HTMLElement>): boolean => {
  const area = event.currentTarget
  const target = event.target

  if (event.defaultPrevented || !(target instanceof Element) || !area.contains(target)) return false

  const control = target.closest(AREA_CONTROLS)

  if (control && control !== area && area.contains(control)) return false

  return !window.getSelection()?.toString()
}
