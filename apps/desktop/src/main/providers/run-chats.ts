import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ProviderId } from '@shared/providers'

import type { ClaudeService } from '../claude/claude-service'
import { AI_CHATS_DIR } from '../connectors/connectors.constants'
import { makeThumbnail } from '../agents/images/thumbnail'
import { ConnectorChat } from '../claude/connector-chat/connector-chat'
import { connectorChats } from '../claude/connector-chat/connector-chats'
import type { ConversationFeedSync } from '../claude/conversation/conversation-feed'
import type { OpenAiChat } from '../connectors/ai/ai-chat'
import type { SessionProcess } from '../scenarios/engine/scenario-session'
import { runJournalsDir } from './run-providers'
import type { ScenarioProvider } from './scenario-provider'
import { NO_USAGE, turnResult, assistantText } from './run-stream/claude-stream'
import { journalPath } from './run-stream/run-journal'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Строка журнала; битая или пустая - null. */
const entryOf = (line: string): unknown => {
  try {
    return line.trim() ? (JSON.parse(line) as unknown) : null
  } catch {
    return null
  }
}

/** Процесс, которого нет (CLI провайдера не нашёлся): разговор слышит выход до первого слова. */
const goneProcess = (): SessionProcess => ({
  isAlive: false,
  write: () => undefined,
  control: () => Promise.reject(new Error('Session process is gone')),
  respond: () => undefined,
  stop: () => Promise.resolve(),
})

/**
 * Прошлые ходы разговора о коннекторе после перезапуска IDE - из журнала сессии (run-journal.ts):
 * слова человека и ответы модели теми же элементами ленты, что живой разговор.
 */
const replayJournal = async (feed: ConversationFeedSync, path: string): Promise<void> => {
  const lines = (await readFile(path, 'utf8').catch(() => '')).split('\n').slice(1)
  let turns = 0
  let open = false
  const close = () => {
    if (open)
      feed.builder.apply(turnResult({ text: '', isError: false, turns, usage: NO_USAGE }), true)
    open = false
  }

  for (const line of lines) {
    const entry = entryOf(line)

    if (!isRecord(entry) || typeof entry['text'] !== 'string') continue

    if (entry['who'] === 'prompt') {
      close()
      turns += 1
      open = true
      feed.builder.addUserMessage(randomUUID(), entry['text'], [], false)
    } else if (entry['who'] === 'model') {
      feed.builder.apply(assistantText(randomUUID(), entry['text']), true)
    }
  }

  close()
  feed.flush()
}

/**
 * Разговор о коннекторе (ADR 0050) на исполнителе провайдера без своего `claude -p` - Codex и
 * открытые модели: тот же разговор, что у Claude Code (ConnectorChat), процесс - переводчик
 * провайдера в поток Claude. Только чтение и веб, ответ каждого хода - по схеме; правила - бриф
 * сессии. cwd - своя папка разговоров (без правил чужого проекта).
 */
export const runChats =
  (provider: ScenarioProvider, cwd: string, journalDir: string): OpenAiChat =>
  (options, events) => {
    let loaded: Promise<void> | null = null

    return new ConnectorChat(
      options,
      {
        spawn: (resume, wires) => {
          const process = provider.spawn(
            {
              sessionId: options.sessionId,
              resume,
              model: options.model,
              effort: options.effort,
              permissionMode: 'readOnly',
              briefing: options.instructions,
              accountId: provider.accounts.current(),
              outputSchema: options.schema as Record<string, unknown>,
              web: true,
            },
            { cwd, projectPath: cwd },
            wires,
          )

          if (process) return process

          wires.onMissing()
          queueMicrotask(() => wires.onExit(null, 'The AI provider is not installed.'))

          return goneProcess()
        },
        load: (feed) =>
          (loaded ??= replayJournal(feed, journalPath(journalDir, options.sessionId))),
        thumbnail: makeThumbnail,
        forget: () => Promise.resolve(),
      },
      events,
    )
  }

/**
 * Разговоры о коннекторе всех провайдеров: Claude Code - своим `claude -p`, остальные - через
 * исполнителя провайдера; какой - выбран при создании (ADR 0050).
 */
export const connectorChatsOf = (
  claude: ClaudeService,
  runners: ReadonlyMap<ProviderId, ScenarioProvider>,
  dataDir: string,
): OpenAiChat => {
  const cwd = join(dataDir, AI_CHATS_DIR)
  const claudeChats = connectorChats(claude, cwd)

  return (options, events) => {
    const runner = runners.get(options.provider)

    return options.provider === 'claude' || !runner
      ? claudeChats(options, events)
      : runChats(runner, cwd, runJournalsDir(dataDir, options.provider))(options, events)
  }
}
