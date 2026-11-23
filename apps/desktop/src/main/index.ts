import { join } from 'node:path'

import { app } from 'electron'
import type { BrowserWindow } from 'electron'

import type { AgentPanelState } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'
import type { ConversationCall } from '@shared/panel-prefs'
import type { ProviderId } from '@shared/providers'
import type { SoundPrefs } from '@shared/sounds'
import type { WorkspaceState } from '@shared/workspace'

import { applyAppProfile, PROFILE_DIR_ENV } from './app-profile'
import { featureServices } from './feature-services'
import { startIdeFeatures } from './ide-features'
import { installApplicationMenu } from './menu'
import { IS_MAC, IS_WINDOWS, WINDOWS_APP_ID } from './platform'
import { attachGateway, connectorLinks, startProviderPanels } from './provider-panels'
import { startConnectors } from './connectors/connectors-setup'
import { extensionsFolderPath } from './extensions/extensions-folder'
import { OutsideWatchers } from './fs/outside-watchers'
import { ProjectWatchers } from './fs/project-watchers'
import { settleWrites } from './fs/text-write'
import { GitStatusService } from './git/git-status-service'
import { LocalHistory } from './history/local-history'
import { InboxLink } from './inbox/inbox-agent'
import { broadcast } from './ipc/broadcast'
import { registerInvokeHandlers } from './ipc/handle'
import { createInvokeHandlers } from './ipc/register-handlers'
import { ProcessGroup } from './process/process-group'
import { loginShellEnv } from './process/shell-env'
import { connectorChatsOf } from './providers/run-chats'
import { runProviders } from './providers/run-providers'
import { SearchService } from './search/search-service'
import { ServiceAiService } from './service-ai/service-ai-service'
import { SoundsService } from './sounds/sounds-service'
import { JsonFile } from './storage/json-file'
import { createTerminalService } from './terminal/terminal-setup'
import { UpdateService } from './updates/update-service'
import { UPDATE_FEED_URL, UPDATE_FEED_OVERRIDE_ENV } from './updates/update.constants'
import { saveEditorBeforeQuit } from './window/editor-save'
import { EDITOR_SAVE_TIMEOUT_MS } from './window/editor-save.constants'
import { createMainWindow } from './window/main-window'
import { ideWindows } from './window/overlay-windows'
import { hideConsoleWindows } from './windows/console-hide'
import { homeFolderPath } from './workspace/home-folder'
import { pickAndOpenProject } from './workspace/project-dialogs'
import { WorkspaceService } from './workspace/workspace-service'
import { watchAgentEdits } from './claude/changes/agent-edits-tap'
import { startConversationSearch } from './claude/search/search-setup'

/** В dev страницу отдаёт Vite (адрес передаёт electron-vite), в сборке - файл. */
const RENDERER_URL = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']

const PROFILE_DIR = applyAppProfile()

// Порт отладки окна в dev: через него агент снимает скриншоты и кликает
// (scripts/cdp.mjs). В собранном приложении порт открывают флагом запуска.
const CDP_PORT = process.env['AGENTIC_WORKSTATION_CDP_PORT']

if (!app.isPackaged && CDP_PORT) app.commandLine.appendSwitch('remote-debugging-port', CDP_PORT)

let mainWindow: BrowserWindow | null = null
/** Окно закрыли или оно упало: звонок из панели без него не живёт (ADR 0104). */
let windowGone = (): void => undefined

/** Выход дошёл до конца (всё сохранено и погашено): окну можно закрываться. */
let quitDone = false

const openMainWindow = () => {
  mainWindow = createMainWindow(RENDERER_URL)
  mainWindow.on('closed', () => {
    mainWindow = null
    windowGone()
  })
  mainWindow.webContents.on('render-process-gone', () => windowGone())
  // На Windows крестик окна - это выход (ADR 0048). Закрой окно сразу, страница умерла бы до
  // сохранения редактора и вопроса о файлах в конфликте: закрытие идёт тем же выходом, что ⌘Q,
  // а окно закрывается, когда выход дошёл до конца. Выход отменили - окно остаётся.
  if (!IS_MAC) {
    mainWindow.on('close', (event) => {
      if (quitDone) return

      event.preventDefault()
      app.quit()
    })
  }
}

const bootstrap = async () => {
  // Поиску по разговорам - что проекты открыли и закрыли: он поднимается позже, после
  // разговоров.
  let onWorkspace = (): void => undefined
  // Статистике, Remote Control и локальной истории - состояние, заплатки лент и зов панелей
  // всех провайдеров: они поднимаются позже панелей.
  let observeState = (_provider: ProviderId, _state: AgentPanelState): void => undefined
  let observeFeed = (_patch: FeedPatch): void => undefined
  let observeCall = (_call: ConversationCall): void => undefined
  const workspace = await WorkspaceService.load(
    new JsonFile<WorkspaceState>(join(app.getPath('userData'), 'workspace.json')),
    homeFolderPath(PROFILE_DIR),
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
  // Звуки IDE (ADR 0046): до сервиса разговоров - он зовёт ими с первой вкладки. Своего
  // файла ещё нет - звуки переезжают из настроек панели Claude Code (claude.json).
  const sounds = await SoundsService.load(
    new JsonFile<SoundPrefs>(join(app.getPath('userData'), 'sounds.json')),
    new JsonFile<unknown>(join(app.getPath('userData'), 'claude.json')),
    (prefs) => broadcast('sounds:changed', prefs),
  )
  // Кто делает служебную работу IDE (Settings → AI): до заданий и сценариев - они спрашивают его.
  const serviceAi = await ServiceAiService.open(app.getPath('userData'))
  const providerPanels = await startProviderPanels({
    userData: app.getPath('userData'),
    version: app.getVersion(),
    homeFolder: homeFolderPath(PROFILE_DIR),
    sounds,
    observers: {
      state: (provider, state) => observeState(provider, state),
      feed: (patch) => observeFeed(patch),
      call: (call) => observeCall(call),
    },
  })
  const { claude, codex, antigravity, kimi, openModels, registry: panels } = providerPanels
  // Исполнители провайдеров без вкладки - один набор на IDE: сценарии, задания, коннектор от ИИ.
  const userData = app.getPath('userData')
  const runners = runProviders({
    ...providerPanels,
    dataDir: userData,
    service: () => serviceAi.value,
  })
  // Уведомления IDE поднимутся с заданиями, а коннектор уведомлений нужен шлюзу уже сейчас:
  // связь между ними ставится заранее (ADR 0069).
  const inboxLink = new InboxLink()
  // Коннекторы к приложениям держит IDE, а не провайдер (ADR 0028): шлюз - до первого
  // процесса разговора, его серверы процессы получают файлом --mcp-config.
  const connectors = await startConnectors({
    rendererUrl: RENDERER_URL,
    ...connectorLinks(providerPanels),
    getWindow: () => mainWindow,
    shellEnv: loginShellEnv,
    projectPaths: () => workspace.getState().projects.map((project) => project.rootPath),
    isTrusted: (projectPath) => claude.isTrusted(projectPath),
    // Коннектор от ИИ собирает провайдер, выбранный при создании (ADR 0050).
    chats: connectorChatsOf(claude, runners, app.getPath('userData')),
    inbox: inboxLink,
  })

  attachGateway(providerPanels, connectors)
  // Поиск по разговорам панели (main/claude/search): поднимается после разговоров.
  const { search: conversationSearch, projectsChanged: searchProjects } = startConversationSearch({
    userData: app.getPath('userData'),
    claude,
    workspace,
  })

  const rootOf = (projectId: string) =>
    workspace.getState().projects.find((project) => project.id === projectId)?.rootPath
  // Локальная история файлов (ADR 0045): события - из слежения за диском, записи IDE и ленты
  // агента; окну - у каких файлов история пополнилась.
  const history = await LocalHistory.open({
    dataDir: app.getPath('userData'),
    listFiles: (root) => search.listFiles(root),
    onChange: (root, paths) => {
      for (const project of workspace.getState().projects) {
        if (project.rootPath === root)
          broadcast('history:changed', { projectId: project.id, paths })
      }
    },
  })
  // Точные правки агентов из потоков CLI - «до» правки, если снимок истории опоздал.
  watchAgentEdits((edit) => history.agentEdited(edit))
  // Слежение за диском открытых проектов: окну - что перечитать в дереве и в редакторе и
  // что .git поменялся (ветка), статусу git, списку изменений и счёту строк - повод перечитаться и
  // разослать себя, если стали другими; истории - что сверить.
  const gitStatus = new GitStatusService({
    status: (projectId, status) => broadcast('git:status', { projectId, status }),
    changes: (projectId, changes) => broadcast('git:changes', { projectId, changes }),
    lines: (projectId, stats) => broadcast('git:lineStats', { projectId, stats }),
  })
  const watchers = new ProjectWatchers((projectId, { directories, renamed, paths, git }) => {
    if (paths === null || paths.length > 0 || git) {
      broadcast('fs:changed', { projectId, directories, renamed, files: paths, git })
    }

    gitStatus.changed(projectId, { git, paths })

    const root = rootOf(projectId)

    if (root && (paths === null || paths.length > 0)) history.diskChanged(root, paths)
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

    history.projectsChanged(workspace.getState().projects.map((project) => project.rootPath))
  }

  // Терминалы под панелью Claude Code (ADR 0037): закрытый проект гасит свои (onWorkspace ниже).
  const terminals = createTerminalService(app.getPath('userData'), app.getVersion())

  // Сценарии (ADR 0039), статистика, Remote Control (ADR 0041), задания и уведомления (ADR 0069) -
  // возможности всей IDE поверх провайдеров.
  const features = await startIdeFeatures({
    claude,
    runners,
    serviceAi,
    panels,
    workspace,
    search: conversationSearch,
    connectors,
    dataDir: app.getPath('userData'),
    version: app.getVersion(),
    getWindow: () => mainWindow,
    silent: () => sounds.prefs.muteAll,
    inboxLink,
    extensionsRoot: extensionsFolderPath(PROFILE_DIR),
  })

  observeState = features.observeState
  observeFeed = (patch) => {
    history.agentFeed(patch)
    features.observeFeed(patch)
  }
  observeCall = features.observeCall
  windowGone = () => features.voice.service.endFrom('desktop')
  searchProjects()
  watchProjects()
  onWorkspace = () => {
    features.projectsChanged()
    searchProjects()
    watchProjects()
    terminals.keepProjects(workspace.getState().projects.map((project) => project.id))
  }

  const services = {
    ...featureServices(features),
    serviceAi,
    workspace,
    updates,
    search,
    claude,
    panels,
    gitStatus,
    outsideWatchers,
    conversationSearch,
    connectors,
    terminals,
    openModels,
    history,
    sounds,
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

    try {
      conversationSearch.dispose()
      watchers.dispose()
      outsideWatchers.dispose()
      // Прогоны сценариев - раньше процессов панели: их сессии пишутся остановленными.
      await features.shutdown()
      await Promise.allSettled([
        claude.shutdown(),
        antigravity.shutdown(),
        kimi.shutdown(),
        codex.shutdown(),
        openModels.shutdown(),
        settleWrites(),
        terminals.shutdown(),
      ])
      // История - после записей: возврат версии, идущий в эту секунду, ещё сверяется.
      await history.close()
      // Шлюз - после процессов разговоров: они ходят в него до последнего хода.
      await connectors.stop()
    } finally {
      // Что бы ни упало выше, IDE закрывается: иначе следующий ⌘Q гасился бы молча.
      quitting = 'ready'
      quitDone = true
      app.quit()
    }
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

  const menu = installApplicationMenu({ openProject: () => void pickAndOpenProject(services) })

  registerInvokeHandlers(createInvokeHandlers({ ...services, menu }), RENDERER_URL)
  openMainWindow()
  updates.start()
}

// На Windows - без окна консоли у каждого процесса, который IDE запускает (ADR 0048): раньше
// первого запуска, до bootstrap. И своё имя приложения - то же, что у ярлыка установщика.
if (IS_WINDOWS) {
  hideConsoleWindows()
  app.setAppUserModelId(WINDOWS_APP_ID)
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

  // На маке приложение живёт без окон, пока его не закроют через ⌘Q; на Windows закрытое
  // окно - это выход, как у всех программ там.
  app.on('window-all-closed', () => {
    if (!IS_MAC) app.quit()
  })

  // Сертификат клиента IDE не нужен никому. Без отказа Electron сам предъявил бы первый
  // из связки ключей любому https-серверу, который его попросит, - например, сайту
  // картинки из чужого README.
  app.on('select-client-certificate', (event, _contents, _url, _list, callback) => {
    event.preventDefault()
    callback()
  })

  app.on('activate', () => {
    if (ideWindows().length === 0) openMainWindow()
  })

  app
    .whenReady()
    .then(bootstrap)
    .catch((error: unknown) => {
      console.error('[main] IDE не запустилась:', error)
      app.quit()
    })
}
