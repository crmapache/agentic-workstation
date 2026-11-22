import type { AgentEventContract, AgentInvokeContract } from './agent.contract'
import { AGENT_EVENTS, AGENT_CHANNELS } from './agent.contract'
import type { ClaudeComposerInvokeContract } from './claude-composer.contract'
import { CLAUDE_COMPOSER_CHANNELS } from './claude-composer.contract'
import type { ClaudePanelEventContract, ClaudePanelInvokeContract } from './claude-panel.contract'
import { CLAUDE_PANEL_EVENTS, CLAUDE_PANEL_CHANNELS } from './claude-panel.contract'
import type {
  ClaudeSearchEventContract,
  ClaudeSearchInvokeContract,
} from './claude-search.contract'
import { CLAUDE_SEARCH_EVENTS, CLAUDE_SEARCH_CHANNELS } from './claude-search.contract'
import type { ClaudeSettingsInvokeContract } from './claude-settings.contract'
import { CLAUDE_SETTINGS_CHANNELS } from './claude-settings.contract'
import type { ClaudeTabsEventContract, ClaudeTabsInvokeContract } from './claude-tabs.contract'
import { CLAUDE_TABS_EVENTS, CLAUDE_TABS_CHANNELS } from './claude-tabs.contract'
import type { CommitPushInvokeContract } from './commit-push.contract'
import { COMMIT_PUSH_CHANNELS } from './commit-push.contract'
import type { ComputerEventContract, ComputerInvokeContract } from './computer.contract'
import { COMPUTER_EVENTS, COMPUTER_CHANNELS } from './computer.contract'
import type { ConnectorsEventContract, ConnectorsInvokeContract } from './connectors.contract'
import { CONNECTORS_EVENTS, CONNECTORS_CHANNELS } from './connectors.contract'
import type { EditorEventContract, EditorInvokeContract } from './editor.contract'
import { EDITOR_EVENTS, EDITOR_CHANNELS } from './editor.contract'
import type { ExtensionStoreInvokeContract } from './extension-store.contract'
import { EXTENSION_STORE_CHANNELS } from './extension-store.contract'
import type { ExtensionsEventContract, ExtensionsInvokeContract } from './extensions.contract'
import { EXTENSIONS_EVENTS, EXTENSIONS_CHANNELS } from './extensions.contract'
import type { FileOpsInvokeContract } from './file-ops.contract'
import { FILE_OPS_CHANNELS } from './file-ops.contract'
import type { FsPathsInvokeContract } from './fs-paths.contract'
import { FS_PATHS_CHANNELS } from './fs-paths.contract'
import type { GitChangesEventContract, GitChangesInvokeContract } from './git-changes.contract'
import { GIT_CHANGES_EVENTS, GIT_CHANGES_CHANNELS } from './git-changes.contract'
import type { IdePrefsEventContract, IdePrefsInvokeContract } from './ide-prefs.contract'
import { IDE_PREFS_EVENTS, IDE_PREFS_CHANNELS } from './ide-prefs.contract'
import type { InboxEventContract, InboxInvokeContract } from './inbox.contract'
import { INBOX_EVENTS, INBOX_CHANNELS } from './inbox.contract'
import type {
  LocalHistoryEventContract,
  LocalHistoryInvokeContract,
} from './local-history.contract'
import { LOCAL_HISTORY_EVENTS, LOCAL_HISTORY_CHANNELS } from './local-history.contract'
import type { MemorySaverEventContract, MemorySaverInvokeContract } from './memory-saver.contract'
import { MEMORY_SAVER_EVENTS, MEMORY_SAVER_CHANNELS } from './memory-saver.contract'
import type { OpenModelsEventContract, OpenModelsInvokeContract } from './open-models.contract'
import { OPEN_MODELS_EVENTS, OPEN_MODELS_CHANNELS } from './open-models.contract'
import type { ProjectSyncEventContract, ProjectSyncInvokeContract } from './project-sync.contract'
import { PROJECT_SYNC_EVENTS, PROJECT_SYNC_CHANNELS } from './project-sync.contract'
import type { RemoteEventContract, RemoteInvokeContract } from './remote.contract'
import { REMOTE_EVENTS, REMOTE_CHANNELS } from './remote.contract'
import type { ScenariosEventContract, ScenariosInvokeContract } from './scenarios.contract'
import { SCENARIOS_EVENTS, SCENARIOS_CHANNELS } from './scenarios.contract'
import type { ServiceAiEventContract, ServiceAiInvokeContract } from './service-ai.contract'
import { SERVICE_AI_EVENTS, SERVICE_AI_CHANNELS } from './service-ai.contract'
import type { SoundsEventContract, SoundsInvokeContract } from './sounds.contract'
import { SOUNDS_EVENTS, SOUNDS_CHANNELS } from './sounds.contract'
import type { StatisticsEventContract, StatisticsInvokeContract } from './statistics.contract'
import { STATISTICS_EVENTS, STATISTICS_CHANNELS } from './statistics.contract'
import type { TasksEventContract, TasksInvokeContract } from './tasks.contract'
import { TASKS_EVENTS, TASKS_CHANNELS } from './tasks.contract'
import type { TerminalEventContract, TerminalInvokeContract } from './terminal.contract'
import { TERMINAL_EVENTS, TERMINAL_CHANNELS } from './terminal.contract'
import type { TrackerEventContract, TrackerInvokeContract } from './tracker.contract'
import { TRACKER_EVENTS, TRACKER_CHANNELS } from './tracker.contract'
import type { VoiceEventContract, VoiceInvokeContract } from './voice.contract'
import { VOICE_EVENTS, VOICE_CHANNELS } from './voice.contract'
import type { WindowEventContract, WindowInvokeContract } from './window.contract'
import { WINDOW_EVENTS, WINDOW_CHANNELS } from './window.contract'

/**
 * Части контракта по областям, собранные в одно место: contract.ts берёт их отсюда
 * целиком и не растёт с каждой новой областью. Новая область - свой файл
 * `<область>.contract.ts` и строка здесь в каждом из четырёх списков.
 */
export type AreaInvokeContract = AgentInvokeContract &
  ClaudeTabsInvokeContract &
  ClaudeSettingsInvokeContract &
  ClaudeComposerInvokeContract &
  ClaudePanelInvokeContract &
  ClaudeSearchInvokeContract &
  FsPathsInvokeContract &
  FileOpsInvokeContract &
  LocalHistoryInvokeContract &
  ProjectSyncInvokeContract &
  GitChangesInvokeContract &
  EditorInvokeContract &
  WindowInvokeContract &
  ConnectorsInvokeContract &
  ComputerInvokeContract &
  TerminalInvokeContract &
  ScenariosInvokeContract &
  StatisticsInvokeContract &
  RemoteInvokeContract &
  SoundsInvokeContract &
  VoiceInvokeContract &
  MemorySaverInvokeContract &
  ServiceAiInvokeContract &
  IdePrefsInvokeContract &
  CommitPushInvokeContract &
  TasksInvokeContract &
  InboxInvokeContract &
  OpenModelsInvokeContract &
  ExtensionsInvokeContract &
  ExtensionStoreInvokeContract &
  TrackerInvokeContract

export type AreaEventContract = AgentEventContract &
  ClaudeTabsEventContract &
  ClaudePanelEventContract &
  ClaudeSearchEventContract &
  ProjectSyncEventContract &
  LocalHistoryEventContract &
  GitChangesEventContract &
  EditorEventContract &
  WindowEventContract &
  ConnectorsEventContract &
  ComputerEventContract &
  TerminalEventContract &
  ScenariosEventContract &
  StatisticsEventContract &
  RemoteEventContract &
  SoundsEventContract &
  VoiceEventContract &
  MemorySaverEventContract &
  ServiceAiEventContract &
  IdePrefsEventContract &
  TasksEventContract &
  InboxEventContract &
  OpenModelsEventContract &
  ExtensionsEventContract &
  TrackerEventContract

/** Каналы областей в рантайме: их разворачивает INVOKE_CHANNELS. */
export const AREA_CHANNELS = {
  ...AGENT_CHANNELS,
  ...CLAUDE_TABS_CHANNELS,
  ...CLAUDE_SETTINGS_CHANNELS,
  ...CLAUDE_COMPOSER_CHANNELS,
  ...CLAUDE_PANEL_CHANNELS,
  ...CLAUDE_SEARCH_CHANNELS,
  ...FS_PATHS_CHANNELS,
  ...FILE_OPS_CHANNELS,
  ...LOCAL_HISTORY_CHANNELS,
  ...PROJECT_SYNC_CHANNELS,
  ...GIT_CHANGES_CHANNELS,
  ...EDITOR_CHANNELS,
  ...WINDOW_CHANNELS,
  ...CONNECTORS_CHANNELS,
  ...COMPUTER_CHANNELS,
  ...TERMINAL_CHANNELS,
  ...SCENARIOS_CHANNELS,
  ...STATISTICS_CHANNELS,
  ...REMOTE_CHANNELS,
  ...SOUNDS_CHANNELS,
  ...VOICE_CHANNELS,
  ...MEMORY_SAVER_CHANNELS,
  ...SERVICE_AI_CHANNELS,
  ...IDE_PREFS_CHANNELS,
  ...COMMIT_PUSH_CHANNELS,
  ...TASKS_CHANNELS,
  ...INBOX_CHANNELS,
  ...OPEN_MODELS_CHANNELS,
  ...EXTENSIONS_CHANNELS,
  ...EXTENSION_STORE_CHANNELS,
  ...TRACKER_CHANNELS,
} satisfies Record<keyof AreaInvokeContract, true>

/** События областей: их разворачивает EVENT_CHANNELS. */
export const AREA_EVENTS = {
  ...AGENT_EVENTS,
  ...CLAUDE_TABS_EVENTS,
  ...CLAUDE_PANEL_EVENTS,
  ...CLAUDE_SEARCH_EVENTS,
  ...PROJECT_SYNC_EVENTS,
  ...LOCAL_HISTORY_EVENTS,
  ...GIT_CHANGES_EVENTS,
  ...EDITOR_EVENTS,
  ...WINDOW_EVENTS,
  ...CONNECTORS_EVENTS,
  ...COMPUTER_EVENTS,
  ...TERMINAL_EVENTS,
  ...SCENARIOS_EVENTS,
  ...STATISTICS_EVENTS,
  ...REMOTE_EVENTS,
  ...SOUNDS_EVENTS,
  ...VOICE_EVENTS,
  ...MEMORY_SAVER_EVENTS,
  ...SERVICE_AI_EVENTS,
  ...IDE_PREFS_EVENTS,
  ...TASKS_EVENTS,
  ...INBOX_EVENTS,
  ...OPEN_MODELS_EVENTS,
  ...EXTENSIONS_EVENTS,
  ...TRACKER_EVENTS,
} satisfies Record<keyof AreaEventContract, true>
