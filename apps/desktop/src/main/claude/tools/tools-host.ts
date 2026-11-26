import type { SlashCommand } from '@shared/conversation'

import type { ClaudeCli } from '../cli/cli-locator'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'

/** Что экранам плагинов и /config нужно от сервиса разговоров. */
export type ToolsHost = {
  runtime: (conversationId: string) => ConversationRuntime
  runtimes: () => ConversationRuntime[]
  cli: () => Promise<ClaudeCli | null>
  onCommands: (projectPath: string, commands: SlashCommand[]) => void
}
