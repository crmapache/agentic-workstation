import { readFile } from 'node:fs/promises'

import type { FeedItem, ConversationFeed } from '@shared/conversation-feed'

import type { StepFeed } from '../scenario-provider'
import { AcpFeedBuilder } from '../../acp/feed/acp-feed-builder'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Строка журнала сессии прогона (run-journal.ts); битая или чужая - null. */
const entryOf = (line: string): { at: number; who: string; text: string } | null => {
  try {
    const entry: unknown = line.trim() ? JSON.parse(line) : null

    return isRecord(entry) && typeof entry['who'] === 'string' && typeof entry['text'] === 'string'
      ? { at: Date.parse(String(entry['at'])) || 0, who: entry['who'], text: entry['text'] }
      : null
  } catch {
    return null
  }
}

/**
 * Лента из журнала сессии прогона - тем же сборщиком, что повтор истории у агента: сообщения
 * прогона, ответы модели, вызовы строкой журнала, сбои. Время элементов - время строк журнала.
 */
export const journalFeed = async (path: string): Promise<FeedItem[]> => {
  const lines = (await readFile(path, 'utf8').catch(() => '')).split('\n').slice(1)
  let at = 0
  const builder = new AcpFeedBuilder(undefined, () => at, undefined, undefined, 'j-')
  let calls = 0
  let previous = ''

  for (const line of lines) {
    const entry = entryOf(line)

    if (!entry) continue

    at = entry.at

    if (entry.who === 'prompt') {
      builder.update({
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: entry.text },
      })
    } else if (entry.who === 'model') {
      // Ответы подряд сборщик склеивает в один - абзацем между ними.
      const text = previous === 'model' ? `\n\n${entry.text}` : entry.text

      builder.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } })
    } else if (entry.who === 'tool') {
      calls += 1
      builder.update({
        sessionUpdate: 'tool_call',
        toolCallId: `call-${calls}`,
        title: entry.text,
        kind: 'other',
        status: 'completed',
      })
    } else {
      builder.addNotice('cli-error', entry.text)
    }

    previous = entry.who
  }

  builder.finishReplay()

  return [...builder.items]
}

/**
 * Журнал шага прогона ACP (окно сценария и задания): лента целиком одним чтением, страниц
 * раньше нет - ACP повторяет историю только всю сразу. Откуда лента - решает read.
 */
export class AcpStepFeed implements StepFeed {
  private items: readonly FeedItem[] = []
  private loading: Promise<void> | null = null

  constructor(
    private readonly engineId: string,
    private readonly read: () => Promise<FeedItem[]>,
  ) {}

  ensureLoaded(): Promise<void> {
    this.loading ??= this.read().then(
      (items) => {
        this.items = items
      },
      (error: unknown) => console.warn('[runs] журнал шага ACP не прочитался:', error),
    )

    return this.loading
  }

  async loadEarlier(): Promise<ConversationFeed> {
    await this.ensureLoaded()

    return this.snapshot()
  }

  snapshot(): ConversationFeed {
    return { conversationId: this.engineId, items: [...this.items], tasks: [], hasEarlier: false }
  }

  dispose(): void {
    this.loading = null
  }
}
