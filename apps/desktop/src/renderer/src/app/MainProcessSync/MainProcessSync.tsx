import { useConnectorsSync } from '../../state/connectors.queries'
import { useGitChangesSync } from '../../state/git-changes.queries'
import { useUpdateStatusSync } from '../../state/updates.queries'
import { useWorkspaceSync } from '../../state/workspace.queries'
import { useAsideSync } from '../../features/claude-code/aside.queries'
import { useClaudeSync } from '../../features/claude-code/claude.queries'
import { useClaudeSearchSync } from '../../features/claude-code/search.queries'
import { useEditorSync } from '../../features/editor/editor-sync.hooks'
import { useDirectorySync } from '../../features/file-tree/file-tree.queries'
import { useGitStatusSync } from '../../features/file-tree/git-status.queries'
import { useGitHeadSync } from '../../features/git/git.queries'
import { useTerminalSync } from '../../features/terminal/terminal.queries'

/**
 * Подписки на события главного процесса - по одной на всё окно. Отдельный
 * компонент, потому что подпискам нужен кэш React Query, а он есть только внутри
 * провайдера.
 */
export const MainProcessSync = () => {
  useWorkspaceSync()
  useUpdateStatusSync()
  useClaudeSync()
  useAsideSync()
  useClaudeSearchSync()
  useDirectorySync()
  useGitStatusSync()
  useGitChangesSync()
  useGitHeadSync()
  useEditorSync()
  useConnectorsSync()
  useTerminalSync()

  return null
}
