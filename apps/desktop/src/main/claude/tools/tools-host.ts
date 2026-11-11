import type { SlashCommand } from '@shared/claude'

import type { ClaudeCli } from '../cli/cli-locator'
import type { ConversationRuntime } from '../conversation/conversation-runtime'

/** Что экранам плагинов и /config нужно от сервиса разговоров. */
export type ToolsHost = {
  runtime: (conversationId: string) => ConversationRuntime
  runtimes: () => ConversationRuntime[]
  cli: () => Promise<ClaudeCli | null>
  /** Доверился ли человек папке: без этого CLI в ней не запускается ни в каком обходе. */
  isTrusted: (projectPath: string) => Promise<boolean>
  onCommands: (projectPath: string, commands: SlashCommand[]) => void
}
