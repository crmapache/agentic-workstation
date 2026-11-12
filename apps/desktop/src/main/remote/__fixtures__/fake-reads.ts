import type { ClaudeState, Conversation, HistoryEntry } from '@shared/claude'
import type { FeedItem, ConversationFeed } from '@shared/claude-feed'

import type { PicturesPort, ConversationsPort } from '../bridge/bridge-ports'

/**
 * Чтение разговоров для тестов Remote Control - история проекта, страница транскрипта выше
 * ленты, картинка сообщения и её уменьшение. Отвечают как ClaudeService и nativeImage и пишут
 * каждый вызов; данные - у фикстуры IDE (fake-ide.ts), которая их сюда и передаёт.
 */

/** Прошлый разговор проекта, которого нет вкладкой: его можно открыть с телефона. */
export const PAST_SESSION = '9a8b7c6d-5e4f-3a2b-1c0d-ffeeddccbbaa'

/** Картинка сообщения целиком - как её отдаёт claude:getImage (data URL). */
export const imageOf = (bytes: number): string => `data:image/png;base64,${'A'.repeat(bytes)}`

/**
 * История проекта - как её отдаёт ClaudeService: открытый разговор и прошлый. В заголовке
 * прошлого - путь проекта: телефону он уходит меткой.
 */
const historyOf = (projectPath: string, openSession: string): HistoryEntry[] => [
  {
    sessionId: PAST_SESSION,
    title: `Refactor ${projectPath}/src/db`,
    updatedAt: 500,
    isOpen: false,
  },
  { sessionId: openSession, title: 'Fix the login bug', updatedAt: 900, isOpen: true },
]

export type ReadsIde = {
  record: (name: string, ...args: unknown[]) => null
  state: ClaudeState
  feed: ConversationFeed
  /** Транскрипт выше ленты: страница, которую ленте IDE отдаст loadEarlier (как окну). */
  earlier: FeedItem[]
  /** Картинки сообщений по `messageId:index`. */
  images: Map<string, string>
  projectPath: string
  conversationId: string
  conversationOf: (over: Partial<Conversation>) => Conversation
}

type Reads = Pick<ConversationsPort, 'history' | 'openHistory' | 'loadEarlier' | 'image'>

export const readsOf = (ide: ReadsIde): Reads => {
  const history = historyOf(ide.projectPath, ide.conversationOf({}).sessionId)

  return {
    history: (projectPath) => {
      ide.record('history', projectPath)

      return Promise.resolve(projectPath === ide.projectPath ? history : [])
    },
    // Как ClaudeService.openHistory: вкладка с id сессии, заголовок - из транскрипта.
    openHistory: (projectPath, sessionId) => {
      ide.record('openHistory', projectPath, sessionId)

      const entry = history.find((one) => one.sessionId === sessionId)

      if (!entry || projectPath !== ide.projectPath) return Promise.resolve(null)

      ide.state.conversations = [
        ...ide.state.conversations,
        ide.conversationOf({ id: `history-${sessionId}`, sessionId, title: entry.title }),
      ]

      return Promise.resolve(`history-${sessionId}`)
    },
    // Как ConversationFeedSync.loadEarlier: страница транскрипта встаёт перед лентой.
    loadEarlier: (id) => {
      ide.record('loadEarlier', id)
      ide.feed.items = [...ide.earlier.splice(0), ...ide.feed.items]
      ide.feed.hasEarlier = false

      return Promise.resolve(ide.feed)
    },
    image: (id, messageId, index) =>
      Promise.resolve(
        id === ide.conversationId ? (ide.images.get(`${messageId}:${index}`) ?? null) : null,
      ),
  }
}

/** Как nativeImage: JPEG тем меньше, чем меньше сторона; «нечитаемое» - null. */
export const picturesOf = (record: ReadsIde['record']): PicturesPort => ({
  shrink: (dataUrl, edge, quality) => {
    record('shrink', edge, quality)

    return dataUrl.includes('unreadable')
      ? null
      : `data:image/jpeg;base64,${'B'.repeat(edge * 200)}`
  },
})
