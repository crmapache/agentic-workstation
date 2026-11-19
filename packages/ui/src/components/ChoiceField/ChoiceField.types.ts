/** Вариант поля выбора: значение, подпись и пояснение в меню; погашенный не выбирается. */
export type ChoiceOption = {
  value: string
  label: string
  description?: string | undefined
  disabled?: boolean | undefined
}

export type ChoiceFieldProps = {
  /** Подпись над полем: «Model», «Provider». */
  label: string
  value: string
  options: readonly ChoiceOption[]
  onPick: (value: string) => void
}
