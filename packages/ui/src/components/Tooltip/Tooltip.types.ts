import type { ReactNode } from 'react'

/** С какой стороны элемента встаёт подсказка. Не помещается - перевернётся сама. */
export type TooltipPlacement = 'top' | 'bottom' | 'start' | 'end'

/**
 * Ступень показания в справке - роли --color-gauge-*, как у колец и полос, которые она
 * поясняет: success - в запасе, warning - быстрее нормы, high - заметно быстрее, danger -
 * предел. Режим спокойных цветов приглушает их вместе с кольцами.
 */
export type TooltipTone = 'success' | 'warning' | 'high' | 'danger'

/** Строка справки: подпись слева, значение справа, рядом с ним - тише - уточнение. */
export type TooltipRow = {
  key: string
  label: string
  value: string
  /** Уточнение значения тише его самого: «Sun 20:00» к «2d 13h». */
  aside?: string | undefined
  tone?: TooltipTone | undefined
}

/**
 * Справка вместо строки: у заголовка (label) справа главное число, под ним строки
 * «подпись - значение» ровными колонками и мелкая заметка внизу. Для показаний, где
 * чисел несколько, - строка через точки их не читала бы.
 */
export type TooltipDetails = {
  /** Главное число у заголовка: «74%». */
  value?: string | undefined
  tone?: TooltipTone | undefined
  rows: readonly TooltipRow[]
  /** Мелкая строка под числами: доплата, давность цифр. */
  note?: string | undefined
}

export type TooltipProps = {
  /** Текст подсказки, а со справкой (details) - её заголовок. */
  label: string
  placement?: TooltipPlacement | undefined
  /** Справка в несколько строк вместо одной строки текста. */
  details?: TooltipDetails | undefined
  /**
   * Обёртка растягивается на всё место в родителе-flex, а не по размеру содержимого:
   * для элемента, который сам занимает всю ячейку (подпись вкладки).
   */
  stretch?: boolean | undefined
  /**
   * Не показывать: подсказка не повторяет то, на чём висит. Имя вкладки целиком на
   * виду - подсказка с ним же молчит, обрезанное - говорит.
   */
  disabled?: boolean | undefined
  /** Элемент, к которому подсказка: кнопка, вкладка. */
  children: ReactNode
}

export type TooltipDetailsBodyProps = { title: string; details: TooltipDetails }
