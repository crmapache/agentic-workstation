import type { ChoiceMarkShape } from '@agentic-workstation/ui/ChoiceMark.types'

/** Строка выбора; disabled - видна, но не выбирается (режим, который IDE гасит этому разговору). */
export type OptionItem<V extends string> = {
  value: V
  label: string
  description?: string
  disabled?: boolean | undefined
}

export type OptionListProps<V extends string> = {
  /** Что выбирают - для скринридера. */
  label: string
  options: readonly OptionItem<V>[]
  isSelected: (value: V) => boolean
  onSelect: (value: V) => void
  /** circle - один из многих, square - сколько угодно. */
  shape?: ChoiceMarkShape | undefined
  disabled?: boolean | undefined
}
