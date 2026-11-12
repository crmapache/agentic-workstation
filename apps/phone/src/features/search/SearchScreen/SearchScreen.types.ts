import type {
  SearchWire,
  AiSearchWire,
} from '@agentic-workstation/remote-protocol/conversation-wire-types'

/** Кусок найденного сообщения: найденные слова (hit) закрашиваются там, где стоят. */
export type SnippetPiece = { text: string; hit: boolean }

/** Последний поиск экрана: набранными словами (индекс IDE) или описанием (модель). */
export type SearchResult = { kind: 'words'; data: SearchWire } | { kind: 'ai'; data: AiSearchWire }

/** Идущий поиск модели: его id (по нему отмена) и когда начался (часы телефона). */
export type AiRun = { runId: string; startedAt: number }
