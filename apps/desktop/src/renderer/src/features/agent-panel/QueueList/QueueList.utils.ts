import type { ParseKeys } from 'i18next'

import type { QueueHold } from '@shared/conversation'
import type { DraftToken } from '@shared/message-draft'

import { pastedOrdinals } from '../message.utils'
import type { PictureSource } from '../picture.types'
import { chipPicture } from '../picture.utils'

/** Строка очереди под указателем по высоте; -1 - мимо всех. */
export const rowAt = (rows: readonly (HTMLElement | null)[], clientY: number): number =>
  rows.findIndex((row) => {
    if (!row) return false

    const rect = row.getBoundingClientRect()

    return clientY >= rect.top && clientY <= rect.bottom
  })

/**
 * Где в очереди стоит место правки - перед прежним соседом, а ушедший сосед - конец.
 * -1 - ничего не правят.
 */
export const editingIndex = (
  queue: readonly { id: string }[],
  editing: { before: string | null } | undefined,
): number => {
  if (!editing) return -1

  const at = editing.before ? queue.findIndex((item) => item.id === editing.before) : -1

  return at >= 0 ? at : queue.length
}

/**
 * Подпись очереди: во время хода - уйдут по его концу; без хода - что её держит. Очередь
 * вернувшейся вкладки и остановленного хода уйдёт после следующего сообщения человека
 * (как в ACC) - иначе она ответила бы на несделанную работу без единого его слова.
 */
export const queueHintKey = (isRunning: boolean, hold: QueueHold | undefined): ParseKeys => {
  if (isRunning) return 'agentPanel.queue.hint'
  if (hold === 'reopened') return 'agentPanel.queue.afterReopen'
  if (hold === 'paused') return 'agentPanel.queue.afterYou'

  return 'agentPanel.queue.held'
}

/**
 * Картинка за каждым чипом сообщения очереди (null - не картинка). Вставленная без файла
 * берётся из очереди главного процесса - по её месту среди вставленных: байты он держит
 * в том же порядке.
 */
export const queuePictures = (
  tokens: readonly DraftToken[],
  conversationId: string,
  queuedId: string,
): (PictureSource | null)[] => {
  const ordinals = pastedOrdinals(tokens)

  return tokens.map((token, index) => {
    if (token.kind !== 'chip') return null

    const image = ordinals[index] ?? -1

    return chipPicture(
      token.chip,
      image >= 0 ? { kind: 'queued', conversationId, queuedId, image } : null,
    )
  })
}
