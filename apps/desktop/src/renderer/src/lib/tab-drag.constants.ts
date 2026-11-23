/**
 * Запас, с которым проверяется смена места: рука на границе дрожит, и без него соседи
 * прыгали бы туда-обратно вместе с ней.
 */
export const SWAP_GAP_PX = 8

/**
 * Сколько ждать, пока брошенная вкладка доедет до места, если конца перехода не будет
 * (перехода нет вовсе, окно свёрнуто): дольше любого перехода сдвига.
 */
export const GLIDE_WAIT_MS = 400

/**
 * Свойства страницы вдоль оси ряда (DragAxis): из них снимок мест, ход руки, сдвиг вкладки в
 * матрице transform и прокрутка ряда. Вкладки - по горизонтали, иконки полосы окна - по вертикали.
 */
export const AXIS_KEYS = {
  x: {
    start: 'left',
    end: 'right',
    size: 'width',
    pointer: 'clientX',
    shift: 'm41',
    scroll: 'scrollLeft',
    scrollSize: 'scrollWidth',
    clientSize: 'clientWidth',
  },
  y: {
    start: 'top',
    end: 'bottom',
    size: 'height',
    pointer: 'clientY',
    shift: 'm42',
    scroll: 'scrollTop',
    scrollSize: 'scrollHeight',
    clientSize: 'clientHeight',
  },
} as const
