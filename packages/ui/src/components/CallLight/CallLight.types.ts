/** Повод зова: успех, внимание, ошибка - цвет света (роли состояний). */
export type CallLightTone = 'success' | 'attention' | 'danger'

export type CallLightProps = {
  /** Повод зова; null - свет гаснет (прозрачностью, держа прежний цвет до конца). */
  call: CallLightTone | null
  /** Момент зова: от него фаза дыхания и звёздочек, у соседних - своя. */
  since: number | undefined
  /** Без человека рядом: плашка замирает, звёздочки уходят. */
  calm?: boolean | undefined
}
