// Иконка в шапке - размером с подпись капсом рядом: совпадает с --size-icon-sm.
export const CARD_ICON_SIZE = 14

export const CARD_ICON_STROKE_WIDTH = 1.75

/**
 * Свои контролы внутри нажимаемой площади (карточка, строка списка): их нажатие - их действие, а
 * не площади. Поля и подписи к ним тоже: щелчок в них ставит каретку, а не уводит со страницы.
 */
export const AREA_CONTROLS =
  'button, a, input, textarea, select, label, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [contenteditable="true"]'
