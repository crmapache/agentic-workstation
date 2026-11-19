import { useRef, useState, useEffect } from 'react'

import type { FileChange, TurnFeedItem } from '@shared/conversation-feed'

import { useConversationActions } from '../conversation-actions.hooks'
import { useFeedScope } from '../feed-scope.context'
import type { Presses } from './ChangesList.types'
import {
  announced,
  canRevert,
  withPress,
  canRestore,
  withoutStale,
  withoutToken,
  nextPressEvent,
} from './ChangesList.utils'

/**
 * Откат и возврат файлов хода: по строке и всем списком. Пока главный процесс отвечает,
 * кнопки гаснут, а не пропадают (список не прыгает); «Reverting…» - только после тихой
 * паузы; нажатие без ответа через 15 секунд забывается, и строку можно нажать снова.
 */
export const useChangesList = (turn: TurnFeedItem) => {
  const { conversationId } = useFeedScope()
  const { revertChanges } = useConversationActions()
  const [presses, setPresses] = useState<Presses>(new Map())
  const tokenRef = useRef(0)

  // Следующий момент нажатий - конец тихой паузы или предохранителя: перерисовать строки.
  useEffect(() => {
    const delay = nextPressEvent(presses, Date.now())

    if (delay === null) return

    const timer = window.setTimeout(() => {
      setPresses((current) => withoutStale(announced(current, Date.now()), Date.now()))
    }, delay)

    return () => window.clearTimeout(timer)
  }, [presses])

  const act = (changes: readonly FileChange[], path: string | null, restore: boolean) => {
    if (changes.length === 0) return

    tokenRef.current += 1

    const token = tokenRef.current

    setPresses((current) =>
      withPress(current, changes, { restore, token, at: Date.now(), announced: false }),
    )
    // Ответ снимает только своё нажатие: «вернуть всё» после отката не наследует его ожидание.
    void revertChanges(conversationId, turn.id, path, restore).finally(() => {
      setPresses((current) => withoutToken(current, token))
    })
  }

  const isFree = (change: FileChange) => !presses.has(change.path)

  return {
    presses,
    // Считаются вместе с ждущими: кнопки подвала на время ответа гаснут, а не пропадают.
    revertCount: turn.changes.filter(canRevert).length,
    restoreCount: turn.changes.filter(canRestore).length,
    canRevertAll: turn.changes.some((change) => canRevert(change) && isFree(change)),
    canRestoreAll: turn.changes.some((change) => canRestore(change) && isFree(change)),
    toggle: (change: FileChange) => act([change], change.path, change.reverted),
    revertAll: () =>
      act(
        turn.changes.filter((c) => canRevert(c) && isFree(c)),
        null,
        false,
      ),
    restoreAll: () =>
      act(
        turn.changes.filter((c) => canRestore(c) && isFree(c)),
        null,
        true,
      ),
  }
}
