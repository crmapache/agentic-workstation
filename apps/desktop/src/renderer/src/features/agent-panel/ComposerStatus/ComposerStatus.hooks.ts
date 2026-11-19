import type { Conversation } from '@shared/conversation'

import { useConversationActions } from '../conversation-actions.hooks'

/**
 * Выбор модели разговора из раздела Model: смена идёт живому процессу, без перезапуска; с
 * onPicked выбор ведёт дальше, к усилию модели, а не закрывает панель.
 */
export const useModelPick = (conversation: Conversation, onPicked?: () => void) => {
  const { setOptions } = useConversationActions()

  return (model: string | null) => {
    void setOptions(conversation.id, { model })
    onPicked?.()
  }
}
