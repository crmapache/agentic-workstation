/**
 * Кольцо отсчёта рисуется в поле крестика 24×24 (IconButton sm): радиус и толщина - в его
 * единицах, так что кольцо растёт вместе с кнопкой от размера текста.
 */
export const COUNTDOWN_BOX = 24

export const COUNTDOWN_CENTER = COUNTDOWN_BOX / 2

export const COUNTDOWN_STROKE = 1.5

/** Кольцо - по краю кнопки: штрих целиком внутри её поля. */
export const COUNTDOWN_RADIUS = (COUNTDOWN_BOX - COUNTDOWN_STROKE) / 2

export const COUNTDOWN_LENGTH = 2 * Math.PI * COUNTDOWN_RADIUS

/**
 * Запас на округление, когда сравниваются полная и видимая высота свёрнутого пояснения:
 * дробная высота строки (размер текста 110%) округляется у них по-разному. Настоящая обрезка
 * прячет целую строку, это всегда больше пикселя.
 */
export const FOLD_SLACK_PX = 1
