import { join } from 'node:path'

import { app, shell, BrowserWindow } from 'electron'

import type { ClaudeState } from '@shared/claude'
import type { FeedPatch } from '@shared/claude-feed'
import type { WorkspaceState } from '@shared/workspace'

import { applyAppProfile, PROFILE_DIR_ENV } from './app-profile'
import { startIdeFeatures } from './ide-features'
import { installApplicationMenu } from './menu'
import { claudeAsk } from './claude/claude-ask'
import { ClaudeService } from './claude/claude-service'
import type { StoredClaude } from './claude/claude-state'
import { startConnectors } from './connectors/connectors-setup'
import { OutsideWatchers } from './fs/outside-watchers'
import { ProjectWatchers } from './fs/project-watchers'
import { settleWrites } from './fs/text-write'
import { GitStatusService } from './git/git-status-service'
import { broadcast } from './ipc/broadcast'
import { registerInvokeHandlers } from './ipc/handle'
import { createInvokeHandlers } from './ipc/register-handlers'
import { SearchService } from './search/search-service'
import { JsonFile } from './storage/json-file'
import { loginShell, spawnNodePty } from './terminal/node-pty-spawn'
import { terminalEnv } from './terminal/terminal-env'
import { TerminalService } from './terminal/terminal-service'
import { withZshIntegration } from './terminal/zsh-integration'
import { ZSH_INTEGRATION_DIR } from './terminal/zsh-integration.constants'
import { UpdateService } from './updates/update-service'
import { UPDATE_FEED_URL, UPDATE_FEED_OVERRIDE_ENV } from './updates/update.constants'
import { saveEditorBeforeQuit } from './window/editor-save'
import { EDITOR_SAVE_TIMEOUT_MS } from './window/editor-save.constants'
import { createMainWindow } from './window/main-window'
import { pickAndOpenProject } from './workspace/project-dialogs'
import { WorkspaceService } from './workspace/workspace-service'
import type { StoredAccounts } from './claude/accounts/account-store'
import { locateClaudeCli } from './claude/cli/cli-locator'
import { ProcessGroup } from './claude/cli/process-group'
import { loginShellEnv } from './claude/cli/shell-env'
import { SearchDesk } from './claude/search/search-desk'
import { SEARCH_DIR_NAME } from './claude/search/search.constants'

/** В dev страницу отдаёт Vite (адрес передаёт electron-vite), в сборке - файл. */
const RENDERER_URL = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']

const PROFILE_DIR = applyAppProfile()

// Порт отладки окна в dev: через него агент снимает скриншоты и кликает
// (scripts/cdp.mjs). В собранном приложении порт открывают флагом запуска.
const CDP_PORT = process.env['AGENTIC_WORKSTATION_CDP_PORT']

if (!app.isPackaged && CDP_PORT) app.commandLine.appendSwitch('remote-debugging-port', CDP_PORT)

let mainWindow: BrowserWindow | null = null

const openMainWindow = () => {
  mainWindow = createMainWindow(RENDERER_URL)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const bootstrap = async () => {
  // Поиску по разговорам - что проекты открыли и закрыли: он поднимается позже, после
  // разговоров.
  let onWorkspace = (): void => undefined
  // Статистике и Remote Control - состояние панели Claude и заплатки лент: они поднимаются
  // позже панели.
  let observeClaude = (_state: ClaudeState): void => undefined
  let observeFeed = (_patch: FeedPatch): void => undefined
  const workspace = await WorkspaceService.load(
    new JsonFile<WorkspaceState>(join(app.getPath('userData'), 'workspace.json')),
    (state) => {
      broadcast('workspace:changed', state)
      onWorkspace()
    },
  )
  const updates = new UpdateService({
    feedUrl: process.env[UPDATE_FEED_OVERRIDE_ENV] ?? UPDATE_FEED_URL,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    executablePath: app.getPath('exe'),
    downloadsDir: app.getPath('temp'),
    logPath: join(app.getPath('logs'), 'update.log'),
    relaunchEnv: PROFILE_DIR ? `${PROFILE_DIR_ENV}=${PROFILE_DIR}` : '',
    onStatus: (status) => broadcast('updates:status', status),
    quit: () => app.quit(),
  })
  const search = new SearchService()
  const claude = await ClaudeService.load(
    new JsonFile<StoredClaude>(join(app.getPath('userData'), 'claude.json')),
    {
      onState: (state) => {
        broadcast('claude:state', state)
        observeClaude(state)
      },
      onFeed: (patch) => {
        broadcast('claude:feed', patch)
        observeFeed(patch)
      },
      onCall: (call) => broadcast('claude:call', call),
      openPath: (path) => shell.openPath(path),
    },
    {
      file: new JsonFile<StoredAccounts>(join(app.getPath('userData'), 'claude-accounts.json')),
      dir: join(app.getPath('userData'), 'claude-accounts'),
    },
  )
  // Вопрос сбоку (/btw): цепочка вкладки - окну событием, ответы приходят сами.
  claude.panel.aside.onChange = (view) => broadcast('claudePanel:aside', view)
  // Коннекторы к приложениям держит IDE, а не провайдер (ADR 0028): шлюз - до первого
  // процесса разговора, его серверы процессы получают файлом --mcp-config.
  const connectors = await startConnectors({
    serversChanged: (affects) => claude.connectors.serversChanged(affects),
    serverChanged: (serverName) => claude.connectors.serverChanged(serverName),
    getWindow: () => mainWindow,
    shellEnv: loginShellEnv,
    projectPaths: () => workspace.getState().projects.map((project) => project.rootPath),
    isTrusted: (projectPath) => claude.isTrusted(projectPath),
    ask: claudeAsk(claude, join(app.getPath('userData'), 'ai-connector')),
  })

  claude.connectors.configFor = (projectPath) => connectors.mcpConfigFor(projectPath)
  // Поиск по разговорам панели - своим модулем (main/claude/search): индекс по проекту,
  // первая сборка - через 20 секунд после открытия проекта, поиск модели - на аккаунте панели.
  const conversationSearch = new SearchDesk({
    dir: join(app.getPath('userData'), SEARCH_DIR_NAME),
    cli: async () => {
      const cli = await locateClaudeCli()

      return cli && { ...cli, env: claude.accounts.envFor(cli.env) }
    },
    onStep: (step) => broadcast('claudeSearch:step', step),
  })
  const searchProjects = () =>
    conversationSearch.projectsChanged(
      workspace.getState().projects.map((project) => project.rootPath),
    )

  // Слежение за диском открытых проектов: окну - что перечитать в дереве и в редакторе и
  // что .git поменялся (ветка), статусу git и списку изменений - повод перечитаться и
  // разослать себя, если стали другими.
  const gitStatus = new GitStatusService({
    status: (projectId, status) => broadcast('git:status', { projectId, status }),
    changes: (projectId, changes) => broadcast('git:changes', { projectId, changes }),
  })
  const watchers = new ProjectWatchers((projectId, { directories, renamed, paths, git }) => {
    if (paths === null || paths.length > 0 || git) {
      broadcast('fs:changed', { projectId, directories, renamed, files: paths, git })
    }

    gitStatus.changed(projectId, { git, paths })
  })
  // Файлы вне проекта, открытые вкладками, - тем же событием проекта вкладки: редактор
  // узнаёт их по абсолютному пути.
  const outsideWatchers = new OutsideWatchers((projectId, files) =>
    broadcast('fs:changed', { projectId, directories: [], renamed: [], files, git: false }),
  )
  const watchProjects = () => {
    for (const projectId of watchers.sync(workspace.getState().projects)) {
      gitStatus.forget(projectId)
    }
  }

  // Терминалы под панелью Claude Code (ADR 0037): оболочка в корне проекта, закрытый проект
  // гасит свои.
  const terminals = new TerminalService(
    {
      output: (output) => broadcast('terminal:output', output),
      sessions: (sessions) => broadcast('terminal:sessions', sessions),
    },
    {
      spawn: spawnNodePty,
      shell: loginShell,
      env: withZshIntegration(join(app.getPath('userData'), ZSH_INTEGRATION_DIR), () =>
        terminalEnv(process.env, app.getVersion()),
      ),
    },
  )

  // Сценарии (ADR 0039), статистика и Remote Control (ADR 0041) - возможности всей IDE поверх
  // провайдеров.
  const features = await startIdeFeatures({
    claude,
    workspace,
    dataDir: app.getPath('userData'),
    version: app.getVersion(),
    getWindow: () => mainWindow,
  })

  observeClaude = features.observeClaude
  observeFeed = features.observeFeed
  searchProjects()
  watchProjects()
  onWorkspace = () => {
    features.projectsChanged()
    searchProjects()
    watchProjects()
    terminals.keepProjects(workspace.getState().projects.map((project) => project.id))
  }

  const services = {
    workspace,
    updates,
    search,
    claude,
    gitStatus,
    outsideWatchers,
    conversationSearch,
    connectors,
    terminals,
    scenarios: features.scenarios,
    stats: features.statistics.stats,
    remote: features.remote,
    getWindow: () => mainWindow,
  }

  // Процессы CLI, команды «!» и оболочки терминала - дети IDE: уходят вместе с ней, а не висят
  // сиротами. Выход ждёт, пока они закроются, - иначе таймер добивания умер бы вместе с главным
  // процессом.
  let quitting: 'no' | 'waiting' | 'ready' = 'no'

  // Сначала окно дописывает набранное в файлы: автосохранение ждёт паузы в наборе, а ⌘Q
  // её не ждёт. Остались файлы, которые сохранить нельзя (конфликт с диском), - выход
  // отменяется, окно спрашивает человека, и только потом гаснут CLI и записи.
  const quitWhenSaved = async () => {
    const unsaved = await saveEditorBeforeQuit(EDITOR_SAVE_TIMEOUT_MS)

    if (unsaved > 0) {
      quitting = 'no'
      mainWindow?.show()

      return
    }

    conversationSearch.dispose()
    watchers.dispose()
    outsideWatchers.dispose()
    // Прогоны сценариев - раньше процессов панели: их сессии пишутся остановленными.
    await features.shutdown()
    await Promise.allSettled([claude.shutdown(), settleWrites(), terminals.shutdown()])
    // Шлюз - после процессов разговоров: они ходят в него до последнего хода.
    await connectors.stop()
    quitting = 'ready'
    app.quit()
  }

  app.on('before-quit', (event) => {
    if (quitting === 'ready') return

    event.preventDefault()

    if (quitting === 'waiting') return

    quitting = 'waiting'
    void quitWhenSaved()
  })
  // Последняя страховка: главный процесс уходит, не дождавшись (сбой, kill).
  process.on('exit', () => {
    ProcessGroup.killAllNow()
    terminals.killAllNow()
  })

  registerInvokeHandlers(createInvokeHandlers(services), RENDERER_URL)
  installApplicationMenu({ openProject: () => void pickAndOpenProject(services) })
  openMainWindow()
  updates.start()
}

// Второй экземпляр IDE не запускается, а поднимает окно первого: два процесса
// писали бы одно и то же состояние в userData наперегонки.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })

  // На macOS приложение живёт без окон, пока его не закроют через Cmd+Q.
  app.on('window-all-closed', () => undefined)

  // Сертификат клиента IDE не нужен никому. Без отказа Electron сам предъявил бы первый
  // из связки ключей любому https-серверу, который его попросит, - например, сайту
  // картинки из чужого README.
  app.on('select-client-certificate', (event, _contents, _url, _list, callback) => {
    event.preventDefault()
    callback()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow()
  })

  app
    .whenReady()
    .then(bootstrap)
    .catch((error: unknown) => {
      console.error('[main] IDE не запустилась:', error)
      app.quit()
    })
}
