import type { RewindScope, RewindOutcome, RewindPreview } from '@shared/rewind'

import { previewOf, planCodeRevert, writeCodeRevert } from '../../agents/changes/code-revert'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { changesFrom } from './codex-code-rewind'
import { codexOf } from './codex-conversation'

/** Сколько ждать, пока остановленный ход отпустит разговор, прежде чем резать. */
const STOP_WAIT_MS = 10_000
const STOP_POLL_MS = 100

const waitTurnEnd = async (runtime: ConversationRuntime): Promise<boolean> => {
  for (let waited = 0; runtime.turnActive && waited < STOP_WAIT_MS; waited += STOP_POLL_MS) {
    await new Promise((resolve) => setTimeout(resolve, STOP_POLL_MS))
  }

  return !runtime.turnActive
}

/** Текст сообщения, к которому откатились, - обратно в поле. */
const ownText = (runtime: ConversationRuntime, messageId: string): string => {
  const item = codexOf(runtime).feed.builder.items.find((entry) => entry.id === messageId)

  return item?.kind === 'user' ? item.text : ''
}

/** Откат кода к сообщению - сухим прогоном обратных правок: для диалога до нажатия. */
export const previewCodexRewind = async (
  runtime: ConversationRuntime,
  messageId: string,
): Promise<RewindPreview> => {
  const { projectPath } = runtime.meta
  const items = codexOf(runtime).feed.builder.items

  return previewOf(await planCodeRevert(changesFrom(items, messageId), projectPath), projectPath)
}

/** Разговор - к сообщению: ход, который оно начало, и всё после него уходят. */
const cutConversation = async (
  runtime: ConversationRuntime,
  messageId: string,
  turnId: string,
  revert: (threadId: string, beforeTurnId: string) => Promise<boolean>,
): Promise<boolean> => {
  const { feed } = codexOf(runtime)
  const queuedAtPress = runtime.meta.queue.map((item) => item.id)

  if (!(await revert(runtime.meta.sessionId, turnId))) return false

  for (const held of runtime.held) runtime.session?.dismiss(held)

  runtime.held = []
  feed.builder.truncateFrom(messageId)
  feed.turns.truncateFrom(messageId)
  feed.builder.addNotice('rewound')
  feed.flush()
  runtime.dropQueued(queuedAtPress)
  runtime.update({ turnStartedAt: null, stopRequestedAt: null })
  runtime.syncStatus()

  return true
}

/**
 * Откат Codex к сообщению. Разговор - `thread/revert` с ходом, который оно начало: ход и всё
 * после него уходят из журнала потока и из ленты, вопросы снимаются, очередь, нажатая до
 * отката, не уходит. Код - обратными правками (копий файлов у Codex нет): сначала сухой
 * прогон, и если хоть один файл после правок меняли, не трогается ничего. Идущий ход сначала
 * останавливается. revert - сессией разговора (у потока один писатель).
 */
export const rewindCodex = async (
  runtime: ConversationRuntime,
  messageId: string,
  scope: RewindScope,
  revert: (threadId: string, beforeTurnId: string) => Promise<boolean>,
): Promise<RewindOutcome> => {
  const { feed } = codexOf(runtime)
  const turnId = feed.turns.turnOf(messageId)
  const withCode = scope !== 'conversation'
  const withConversation = scope !== 'code'

  if (withConversation && !turnId) return { rewound: false, reason: 'gone', detail: '' }

  const prefill = ownText(runtime, messageId)

  if (runtime.turnActive) {
    runtime.interrupt()

    if (!(await waitTurnEnd(runtime))) return { rewound: false, reason: 'busy', detail: '' }
  }

  const plan = withCode
    ? await planCodeRevert(changesFrom(feed.builder.items, messageId), runtime.meta.projectPath)
    : null

  if (plan && !plan.ok) return { rewound: false, reason: 'code', detail: plan.reason }
  if (withConversation && turnId && !(await cutConversation(runtime, messageId, turnId, revert))) {
    return { rewound: false, reason: 'notSaved', detail: '' }
  }

  const filesFailed = plan?.ok ? await writeCodeRevert(plan.files) : null

  return { rewound: true, prefill: withConversation ? prefill : '', filesFailed }
}
