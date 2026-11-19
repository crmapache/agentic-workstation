import { relative } from 'node:path'

import type { RewindScope, RewindOutcome, RewindPreview } from '@shared/rewind'
import { REWIND_FILES_LISTED } from '@shared/rewind'

import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { toolTurnChanges } from '../../agents/feed/tool-turn-changes'
import { openCodeOf } from './opencode-conversation'

/** Сколько ждать, пока остановленный ход отпустит разговор, прежде чем резать. */
const STOP_WAIT_MS = 10_000
const STOP_POLL_MS = 100

const waitTurnEnd = async (runtime: ConversationRuntime): Promise<boolean> => {
  for (let waited = 0; runtime.turnActive && waited < STOP_WAIT_MS; waited += STOP_POLL_MS) {
    await new Promise((resolve) => setTimeout(resolve, STOP_POLL_MS))
  }

  return !runtime.turnActive
}

/**
 * Что вернёт откат кода к сообщению - по правкам в ленте с этого сообщения: предпросмотр не
 * трогает файлы (подготовленный откат OpenCode сразу возвращает их на диске).
 */
export const previewOpenCodeRewind = (
  runtime: ConversationRuntime,
  messageId: string,
): Promise<RewindPreview> => {
  const items = openCodeOf(runtime).feed.builder.items
  const start = items.findIndex((item) => item.id === messageId)
  const changes = start < 0 ? [] : toolTurnChanges(items.slice(start))
  const { projectPath } = runtime.meta

  if (changes.length === 0) return Promise.resolve({ state: 'none' })

  return Promise.resolve({
    state: 'ready',
    files: changes
      .slice(0, REWIND_FILES_LISTED)
      .map((change) => relative(projectPath, change.path) || change.path),
    count: changes.length,
    insertions: changes.reduce((sum, change) => sum + change.removed, 0),
    deletions: changes.reduce((sum, change) => sum + change.added, 0),
  })
}

/**
 * Откат OpenCode к сообщению: `revert/stage` (с файлами - по снимкам OpenCode) и
 * `revert/commit` - сообщение и всё после него уходят из сессии и из ленты, вопросы снимаются,
 * очередь, нажатая до отката, не уходит, текст сообщения - обратно в поле. «Только код» OpenCode
 * не умеет: файлы откатываются только вместе с разговором. Идущий ход сначала останавливается;
 * откат - сессией самого разговора (поднимется, если её нет): её память о разговоре та же.
 */
export const rewindOpenCode = async (
  runtime: ConversationRuntime,
  messageId: string,
  scope: RewindScope,
): Promise<RewindOutcome> => {
  if (scope === 'code') return { rewound: false, reason: 'unsupported', detail: '' }

  const { feed } = openCodeOf(runtime)
  const message = feed.builder.items.find((item) => item.id === messageId)
  const prefill = message?.kind === 'user' ? message.text : ''
  const queuedAtPress = runtime.meta.queue.map((item) => item.id)

  if (runtime.turnActive) {
    runtime.interrupt()

    if (!(await waitTurnEnd(runtime))) return { rewound: false, reason: 'busy', detail: '' }
  }

  await runtime.prepareSession()

  const live = openCodeOf(runtime).live

  if (!live) return { rewound: false, reason: 'noProcess', detail: '' }

  const base = `/api/session/${live.sessionId}/revert`

  try {
    await live.server.request('POST', `${base}/stage`, {
      body: { messageID: feed.openCodeIdOf(messageId), files: scope === 'both' },
    })
    await live.server.request('POST', `${base}/commit`)
  } catch (error) {
    return {
      rewound: false,
      reason: 'other',
      detail: error instanceof Error ? error.message : String(error),
    }
  }

  for (const held of runtime.held) runtime.session?.dismiss(held)

  runtime.held = []
  feed.builder.truncateFrom(messageId)
  feed.builder.addNotice('rewound')
  feed.flush()
  runtime.dropQueued(queuedAtPress)
  runtime.update({ turnStartedAt: null, stopRequestedAt: null })
  runtime.syncStatus()

  return { rewound: true, prefill, filesFailed: null }
}
