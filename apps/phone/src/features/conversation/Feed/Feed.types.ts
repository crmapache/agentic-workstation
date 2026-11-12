import type { FeedView } from '@agentic-workstation/remote-protocol/feed'

/** Фото сообщения, которое открыли: чьё, какое по счёту и его миниатюра - её видно сразу. */
export type OpenPhoto = { messageId: string; index: number; thumbnail: string }

/** Идущая задача разговора за вызовом: субагент, флот workflow или фоновая команда. */
export type RunningTask = { taskId: string; kind: string }

/**
 * Что можно сделать из ленты живого разговора. Журнал шага прогона рисуется той же лентой, но
 * только для чтения - там действий нет.
 */
export type FeedActions = {
  /** Остановить задачу (экран спросит «точно?»). */
  onStopTask: (task: RunningTask) => void
  /** Откатить разговор к сообщению человека (экран покажет, что вернётся). */
  onRewind: (messageId: string) => void
}

export type FeedProps = {
  /** Чья лента: ждать её, пока IDE не отвечает, - не вечным знаком работы. */
  agentId: string
  view: FeedView | undefined
  working: string | null
  loadingEarlier: boolean
  onLoadEarlier: () => void
  /** Действия живого разговора; нет - лента только для чтения. Ссылка стабильная: строки - memo. */
  actions?: FeedActions | undefined
  /**
   * Открывать фото крупно: картинку отдаёт только разговор (conversation.image), у журнала
   * шага её взять неоткуда - там миниатюра остаётся миниатюрой.
   */
  photos?: boolean | undefined
}
