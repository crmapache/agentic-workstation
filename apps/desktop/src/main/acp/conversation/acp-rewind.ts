import type { FeedItem } from '@shared/conversation-feed'
import type { RewindScope, RewindOutcome, RewindPreview } from '@shared/rewind'

import type { FileChange } from '../../agents/changes/code-revert'
import { previewOf, planCodeRevert, writeCodeRevert } from '../../agents/changes/code-revert'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { acpOf } from './acp-conversation'

/**
 * Правки агента ACP с сообщения и после, по порядку ленты: вызовы правки и записи, которые
 * применились. Дифф - из итога вызова (у `agy` в вопросе разрешения кусок, в итоге - файл
 * целиком), иначе из вида действия. Созданный файл откат убирает, только если в нём нет ничего
 * сверх созданного (code-revert.ts).
 */
export const acpChangesFrom = (items: readonly FeedItem[], messageId: string): FileChange[] => {
  const start = items.findIndex((item) => item.id === messageId)

  return start < 0
    ? []
    : items.slice(start).flatMap((item): FileChange[] => {
        if (item.kind !== 'tool' || item.status !== 'done') return []

        const { action } = item

        if (action.kind !== 'edit' && action.kind !== 'write') return []

        const hunks = item.result?.patch ?? action.preview

        return hunks.length > 0
          ? [
              {
                path: action.path,
                movedFrom: '',
                kind: item.result?.created ? 'add' : 'update',
                hunks,
              },
            ]
          : []
      })
}

/** Откат кода к сообщению - сухим прогоном обратных правок: для диалога до нажатия. */
export const previewAcpRewind = async (
  runtime: ConversationRuntime,
  messageId: string,
): Promise<RewindPreview> => {
  const { projectPath } = runtime.meta
  const items = acpOf(runtime).feed.builder.items

  return previewOf(await planCodeRevert(acpChangesFrom(items, messageId), projectPath), projectPath)
}

/**
 * Откат у агента ACP (ADR 0092) - только код: разговор назад ACP не отматывает, поэтому
 * панель объявляет одну область «код». Копий файлов у агентов нет - откат обратными правками
 * по диффам ленты, как у Codex: хоть один файл после правок меняли - не трогается ничего. Во
 * время хода не откатывает: окно и не предлагает (правки идут прямо сейчас).
 */
export const rewindAcp = async (
  runtime: ConversationRuntime,
  messageId: string,
  scope: RewindScope,
): Promise<RewindOutcome> => {
  if (scope !== 'code') return { rewound: false, reason: 'unsupported', detail: '' }
  if (runtime.turnActive) return { rewound: false, reason: 'busy', detail: '' }

  const items = acpOf(runtime).feed.builder.items
  const plan = await planCodeRevert(acpChangesFrom(items, messageId), runtime.meta.projectPath)

  if (!plan.ok) return { rewound: false, reason: 'code', detail: plan.reason }

  return { rewound: true, prefill: '', filesFailed: await writeCodeRevert(plan.files) }
}
