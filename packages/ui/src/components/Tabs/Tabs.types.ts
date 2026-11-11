import type { LucideIcon } from 'lucide-react'

export type TabsItem<TabId extends string> = {
  id: TabId
  label: string
  icon?: LucideIcon | undefined
  /**
   * Счётчик после подписи (сколько нашлось в разделе). Стоит с нуля, а не появляется с
   * первым числом: вкладка не меняет ширину под указателем. Ноль тусклый, число - ярче.
   */
  count?: number | undefined
  /**
   * Счётчик только что вырос: номер вспышки, пока она горит (0 или нет - не горит). Новый
   * номер перезапускает её - счёт мог вырасти ещё раз посреди вспышки. Держит вызывающий.
   */
  flash?: number | undefined
  /** Подсказка над вкладкой - клавиша раздела: имя и так на ней. */
  hint?: string | undefined
}

export type TabsProps<TabId extends string> = {
  /** Подпись ряда для скринридера: что переключают вкладки. */
  label: string
  items: readonly TabsItem<TabId>[]
  /** Выбранная вкладка. Её содержимое рисует тот, кто поставил Tabs. */
  value: TabId
  onChange: (id: TabId) => void
  /**
   * Ряд на всю ширину родителя: выбор режима над тем, что он меняет. Вкладки делят поровну
   * любой ряд - и растянутый раскладкой без этого флага.
   */
  fill?: boolean | undefined
}
