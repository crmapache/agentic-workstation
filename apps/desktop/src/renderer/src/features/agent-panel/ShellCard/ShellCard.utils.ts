import type { ParseKeys } from 'i18next'

import type { ShellFeedItem } from '@shared/conversation-feed'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

/** Чем кончилась команда - меткой: тон и подпись; идущую показывает ToolStatus. */
export const shellOutcome = (
  item: ShellFeedItem,
): { tone: BadgeTone; key: ParseKeys; code?: number } | null => {
  if (item.status === 'running') return null
  if (item.status === 'failed') return { tone: 'danger', key: 'agentPanel.shell.failed' }
  if (item.status === 'stopped') return { tone: 'neutral', key: 'agentPanel.shell.stopped' }
  if (item.exitCode === 0) return { tone: 'success', key: 'agentPanel.shell.ok' }

  return { tone: 'danger', key: 'agentPanel.shell.exitCode', code: item.exitCode ?? 1 }
}
