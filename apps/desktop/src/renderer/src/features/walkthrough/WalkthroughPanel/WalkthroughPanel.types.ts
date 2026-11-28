import type { LucideIcon } from 'lucide-react'

import type { WalkthroughPen } from '@shared/walkthrough'

/** Кнопка панели: значок над подписью; у инструмента - взят ли он сейчас. */
export type ToolButtonProps = {
  icon: LucideIcon
  label: string
  active?: boolean
  disabled?: boolean
  onPress: () => void
}

/** Инструмент панели: нажатие берёт его, а взятый - откладывает. */
export type PenButtonProps = Omit<ToolButtonProps, 'onPress'> & {
  pen: WalkthroughPen
  onPick: (pen: WalkthroughPen) => void
}
