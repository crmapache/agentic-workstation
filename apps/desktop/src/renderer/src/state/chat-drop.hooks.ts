import { useId, useRef, useEffect, useLayoutEffect } from 'react'

import type { DraftChip } from '@shared/message-draft'

import { registerChatDrop, useChatDropStore, CHAT_DROP_ATTRIBUTE } from './chat-drop.store'

/**
 * Поле чата как место броска жестом IDE (ADR 0127): атрибуты для узла поля и подсветка, пока над
 * ним несут. take - что сделать с брошенным чипом, берётся свежий на каждый бросок.
 */
export const useChatDropZone = (take: (chip: DraftChip) => void) => {
  const zone = useId()
  const latest = useRef(take)
  const isOver = useChatDropStore((store) => store.over === zone)

  useLayoutEffect(() => {
    latest.current = take
  })

  useEffect(() => registerChatDrop(zone, (chip) => latest.current(chip)), [zone])

  return { attributes: { [CHAT_DROP_ATTRIBUTE]: zone }, isOver }
}
