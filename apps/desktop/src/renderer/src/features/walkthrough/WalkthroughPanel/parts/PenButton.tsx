import type { PenButtonProps } from '../WalkthroughPanel.types'
import { ToolButton } from './ToolButton'

/** Инструмент панели: обводка, подчёркивание или стрелка. Взятый подсвечен, нажатие откладывает. */
export const PenButton = ({ pen, onPick, ...button }: PenButtonProps) => {
  const handlePress = () => onPick(pen)

  return <ToolButton {...button} onPress={handlePress} />
}
