import { useConnectorsSync } from '../../state/connectors.queries'
import { useExtensionsSync } from '../../state/extensions.queries'
import { useGitChangesSync } from '../../state/git-changes.queries'
import { useGitStatusSync } from '../../state/git-status.queries'
import { useIdePrefsSync } from '../../state/ide-prefs.queries'
import { useInboxSync } from '../../state/inbox.queries'
import { useMemorySaverSync } from '../../state/memory-saver.queries'
import { useProvidersSync } from '../../state/providers.queries'
import { useScenariosSync } from '../../state/scenarios.queries'
import { useServiceAiSync } from '../../state/service-ai.queries'
import { useSoundsSync } from '../../state/sounds.queries'
import { useStatisticsSync } from '../../state/statistics.queries'
import { useTasksSync } from '../../state/tasks.queries'
import { useTrackerSync } from '../../state/tracker.queries'
import { useUpdateStatusSync } from '../../state/updates.queries'
import { useWorkspaceSync } from '../../state/workspace.queries'
import { useAsideSync } from '../../features/agent-panel/aside.queries'
import { useConnectionsSync } from '../../features/agent-panel/connections.queries'
import { usePanelsSync } from '../../features/agent-panel/panel.queries'
import { useClaudeSearchSync } from '../../features/agent-panel/search.queries'
import { useEditorSync } from '../../features/editor/editor-sync.hooks'
import { useLocalHistorySync } from '../../features/editor/local-history.queries'
import { useDirectorySync } from '../../features/file-tree/file-tree.queries'
import { useGitHeadSync, useGitLineStatsSync } from '../../features/git/git.queries'
import { useRemoteSync } from '../../features/remote/remote.queries'
import { useTerminalSync } from '../../features/terminal/terminal.queries'

/**
 * Подписки на события главного процесса - по одной на всё окно. Отдельный
 * компонент, потому что подпискам нужен кэш React Query, а он есть только внутри
 * провайдера.
 */
export const MainProcessSync = () => {
  useWorkspaceSync()
  useUpdateStatusSync()
  usePanelsSync()
  useAsideSync()
  useClaudeSearchSync()
  useDirectorySync()
  useGitStatusSync()
  useGitChangesSync()
  useGitHeadSync()
  useGitLineStatsSync()
  useEditorSync()
  useLocalHistorySync()
  useConnectorsSync()
  useTerminalSync()
  useScenariosSync()
  useRemoteSync()
  useStatisticsSync()
  useSoundsSync()
  useMemorySaverSync()
  useServiceAiSync()
  useIdePrefsSync()
  useProvidersSync()
  useTasksSync()
  useInboxSync()
  useTrackerSync()
  useConnectionsSync()
  useExtensionsSync()

  return null
}
