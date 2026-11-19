import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import type { FieldChipsProps } from '../Composer.types'
import { expandChip, removeChip } from '../../field-chips'
import { chipPicture } from '../../picture.utils'
import { DraftChipView } from '../../DraftChipView/DraftChipView'

/**
 * Внутренности чипов поля - порталами в их узлы: сам узел - простой DOM внутри
 * contentEditable, а подпись, иконка, подсказка (у картинки - превью) и кнопки - нашими
 * компонентами. Клик по картинке в поле ничего не открывает: он ставит каретку.
 * Крестик и «развернуть» идут той же дорогой, что Backspace: событием input поля.
 */
export const FieldChips = ({ registry, fieldRef }: FieldChipsProps) => {
  const chips = useSyncExternalStore(registry.subscribe, registry.snapshot)

  const remove = (node: HTMLElement) => () => {
    const root = fieldRef.current

    if (root) removeChip(root, node, registry)
  }

  const expand = (node: HTMLElement, text: string) => () => {
    const root = fieldRef.current

    if (root) expandChip(root, node, text)
  }

  return chips.map(({ id, node, chip }) =>
    createPortal(
      <DraftChipView
        chip={chip}
        picture={chipPicture(chip)}
        onRemove={remove(node)}
        onExpand={chip.kind === 'paste' ? expand(node, chip.text ?? '') : undefined}
      />,
      node,
      id,
    ),
  )
}
