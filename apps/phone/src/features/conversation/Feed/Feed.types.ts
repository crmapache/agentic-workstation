import type { FeedView } from '@agentic-workstation/remote-protocol/feed'

/** Фото сообщения, которое открыли: чьё, какое по счёту и его миниатюра - её видно сразу. */
export type OpenPhoto = { messageId: string; index: number; thumbnail: string }

/** Идущая задача разговора за вызовом: субагент, флот workflow или фоновая команда. */
export type RunningTask = { taskId: string; kind: string }

/**
 * Итог правки файла на строке вызова: строки плюсом и минусом или «не посчитать» - большую
 * правку CLI присылает без диффа, и IDE пишет ей «±», а не «+0 -0».
 */
export type EditCounts = { added: number; removed: number } | 'uncounted'

/**
 * Что можно сделать из ленты живого разговора. Журнал шага прогона рисуется той же лентой, но
 * только для чтения - там действий нет. Действия, которых провайдер разговора не умеет
 * (ProviderCaps.rewind), не передаются - их кнопок в ленте нет. Остановить задачу - не из
 * ленты, а капсулой над ней (TaskCapsules).
 */
export type FeedActions = {
  /** Откатить разговор к сообщению человека (экран покажет, что вернётся). */
  onRewind?: ((messageId: string) => void) | undefined
  /**
   * Читать ответы вслух голосом IDE (ADR 0106): чья IDE и какой разговор. Нет - IDE не умеет или
   * голос у неё выключен, кнопки у ответов нет.
   */
  readAloud?: { agentId: string; conversationId: string } | undefined
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
