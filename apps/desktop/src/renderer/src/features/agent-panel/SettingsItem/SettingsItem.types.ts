import type { ReactNode } from 'react'

export type SettingsItemProps = {
  title: string
  /** Метки сразу за именем: состояние, «выбран». */
  badges?: ReactNode | undefined
  /** Справа в строке имени серым: число инструментов, установок. */
  meta?: string | undefined
  /** Серые строки под именем: откуда, версия, команда. Пустые пропускаются. */
  details?: readonly (string | false | null | undefined)[] | undefined
  /** Подробности моноширинным - команда или адрес. */
  code?: boolean | undefined
  /** Ошибка красным под подробностями: текст CLI как есть. */
  error?: string | undefined
  /** Содержимое под подробностями: описание. */
  children?: ReactNode | undefined
  /** Ряд кнопок внизу. */
  actions?: ReactNode | undefined
  /** Выбранный элемент - оранжевой рамкой. */
  selected?: boolean | undefined
}
