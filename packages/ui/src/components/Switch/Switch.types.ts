export type SwitchProps = {
  /** Что включает переключатель: подпись строки слева. */
  label: string
  /** Пояснение под подписью мельче: что изменится. */
  description?: string | undefined
  checked: boolean
  disabled?: boolean | undefined
  /**
   * Только ползунок: подпись - имя для скринридера и подсказка по наведению. Для места, где
   * и так ясно, что включают (шапка окна предмета). Пояснение тогда не показывается.
   */
  labelHidden?: boolean | undefined
  onChange: (checked: boolean) => void
}
