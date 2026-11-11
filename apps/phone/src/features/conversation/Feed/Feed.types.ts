import type { FeedView } from '@agentic-workstation/remote-protocol/feed'

/** Фото сообщения, которое открыли: чьё, какое по счёту и его миниатюра - её видно сразу. */
export type OpenPhoto = { messageId: string; index: number; thumbnail: string }

export type FeedProps = {
  /** Чья лента: ждать её, пока IDE не отвечает, - не вечным знаком работы. */
  agentId: string
  view: FeedView | undefined
  working: string | null
  loadingEarlier: boolean
  onLoadEarlier: () => void
}
