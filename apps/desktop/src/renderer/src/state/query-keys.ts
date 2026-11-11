import type { SearchFindRequest } from '@shared/claude-search'

/**
 * Ключи кэша React Query для данных главного процесса. Одна сущность - один ключ:
 * и запрос, и событие из главного процесса пишут в одно и то же место.
 */
export const QUERY_KEYS = {
  appInfo: ['app', 'info'],
  resourceUsage: ['app', 'resource-usage'],
  workspace: ['workspace'],
  updateStatus: ['updates', 'status'],
  directory: (projectId: string, relativePath: string) => [
    'fs',
    'directory',
    projectId,
    relativePath,
  ],
  /** Все каталоги проекта разом: сбросить дерево после смены ветки. */
  projectDirectories: (projectId: string) => ['fs', 'directory', projectId],
  /** Картинка проекта в просмотре Markdown (data URL); все картинки проекта - сбросить разом. */
  projectImage: (projectId: string, relativePath: string) => [
    'fs',
    'image',
    projectId,
    relativePath,
  ],
  projectImages: (projectId: string) => ['fs', 'image', projectId],
  /** Картинка с сайта в просмотре Markdown - одна на окно, по адресу. */
  webImage: (url: string) => ['web', 'image', url],
  /** Файлы проекта и найденный текст - для поиска везде. */
  projectFiles: (projectId: string) => ['search', 'files', projectId],
  textSearch: (projectId: string, query: string) => ['search', 'text', projectId, query],
  gitHead: (projectId: string) => ['git', 'head', projectId],
  /** Статусы файлов по git - цвета имён в дереве; свежие присылает главный процесс. */
  gitStatus: (projectId: string) => ['git', 'status', projectId],
  /** Список изменений относительно HEAD (вид Changes); свежий присылает главный процесс. */
  gitChanges: (projectId: string) => ['git', 'changes', projectId],
  /** Файл, каким он лежит в последнем коммите, - левая сторона разницы. */
  gitHeadFile: (projectId: string, path: string) => ['git', 'head-file', projectId, path],
  /** Все файлы проекта из HEAD разом: сбросить после коммита или смены ветки. */
  gitHeadFiles: (projectId: string) => ['git', 'head-file', projectId],
  gitBranches: (projectId: string) => ['git', 'branches', projectId],
  gitPushInfo: (projectId: string) => ['git', 'push-info', projectId],
  /** PR ветки: другая ветка - другой ключ, ответ gh для старой не подставится. */
  gitPullRequest: (projectId: string, branch: string) => ['git', 'pull-request', projectId, branch],
  /** Ключ мутации pull: «git занят» видят все, кто зовёт действия git проекта. */
  gitPull: (projectId: string) => ['git', 'pull', projectId],
  /** Коннекторы к приложениям (ADR 0028): состояние целиком, свежее присылает главный процесс. */
  connectors: ['connectors'],
  /** Живые оболочки терминала всех проектов (ADR 0037); вышедшие убирает главный процесс. */
  terminalSessions: ['terminal', 'sessions'],
  /** MCP-серверы из конфига Claude Code для переноса: свежие на каждое открытие. */
  connectorImportCandidates: ['connectors-import', 'candidates'],
  /** Приложения ИИ на Mac, которым отдают настройку: поставили новое - видно при следующем показе. */
  connectorAgentApps: ['connectors-agent-apps'],
  /** Разговоры с Claude Code и лента каждого (ADR 0009). */
  claudeState: ['claude', 'state'],
  claudeFeed: (conversationId: string) => ['claude', 'feed', conversationId],
  claudeHistory: (projectId: string) => ['claude', 'history', projectId],
  claudeTodayTokens: ['claude', 'todayTokens'],
  /** Вопросы сбоку (/btw) вкладки: цепочку держит главный процесс, ответы - событием. */
  claudeAside: (conversationId: string) => ['claude', 'aside', conversationId],
  /** Где панель искала CLI и что с путём руками (экран «Claude Code not found»). */
  claudeCliSearch: ['claude', 'cliSearch'],
  /** Команды и скиллы проекта с диска - для подсказки «/» до первого хода. */
  claudeCommands: (projectId: string) => ['claude', 'commands', projectId],
  /** Файлы настроек Claude Code проекта и его собственные настройки (/config). */
  claudeProjectSettings: (projectId: string) => ['claude', 'project-settings', projectId],
  claudeConfig: (projectId: string) => ['claude', 'config', projectId],
  pluginCatalog: (projectId: string) => ['claude', 'plugins', projectId],
  /** Картинка за чипом: place - место картинки строкой, whole - целиком, а не превью. */
  claudePicture: (projectId: string, place: string, whole: boolean) => [
    'claude',
    'picture',
    projectId,
    place,
    whole,
  ],
  claudeImage: (conversationId: string, messageId: string, index: number) => [
    'claude',
    'image',
    conversationId,
    messageId,
    index,
  ],
  /**
   * Разговор агента флота с диска. Состояние агента в ключе: прочитанный на бегу
   * транскрипт ответа не содержит, кончившийся агент читается заново - один раз.
   */
  claudeFleetAgent: (conversationId: string, agentId: string, state: string) => [
    'claude',
    'fleet-agent',
    conversationId,
    agentId,
    state,
  ],
  /** Набранный поиск по разговорам: запрос со всем, что меняет ответ (search.queries). */
  claudeSearch: (request: SearchFindRequest) => [
    'claude',
    'search',
    request.projectId,
    request.sessionId,
    request.scope,
    request.query,
    request.matchCase,
    request.wholeWords,
  ],
  claudeRewindPreview: (conversationId: string, messageId: string) => [
    'claude',
    'rewind-preview',
    conversationId,
    messageId,
  ],
} as const
