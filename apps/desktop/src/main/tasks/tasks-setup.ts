import { join } from 'node:path'

import type { BrowserWindow } from 'electron'
import { Notification, powerMonitor } from 'electron'

import type { InboxItem } from '@shared/inbox'
import type { ProviderId } from '@shared/providers'
import { SECOND_MS } from '@shared/time-units'

import type { ClaudeService } from '../claude/claude-service'
import type { ConnectorsService } from '../connectors/connectors-service'
import { openOutside } from '../fs/outside-open'
import { GoalBook } from '../goals/goal-book'
import type { StoredGoals } from '../goals/goal-book'
import { GOAL_SERVER } from '../goals/goal-briefing'
import { goalServer } from '../goals/goal-tools'
import { InboxAgent } from '../inbox/inbox-agent'
import type { InboxLink } from '../inbox/inbox-agent'
import { bannerOf } from '../inbox/inbox-banner'
import { InboxService } from '../inbox/inbox-service'
import type { StoredInbox } from '../inbox/inbox-service'
import { broadcast } from '../ipc/broadcast'
import type { ScenarioProvider } from '../providers/scenario-provider'
import { serviceAuthorAsk, serviceGoalChecks } from '../providers/service-work'
import type { ServiceAiService } from '../service-ai/service-ai-service'
import type { StatsService } from '../statistics/stats-service'
import { JsonFile } from '../storage/json-file'
import { openExternalWeb } from '../window/open-external'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { PanelRegistry } from '../agents/panel/panel-registry'
import { claudeGoalChecks } from '../providers/claude/claude-goal-checks'
import { claudeTaskAuthor } from '../providers/claude/claude-task-author'
import type { TaskAuthor } from './task-author'
import { TaskBook } from './task-book'
import type { StoredTasks } from './task-book'
import { taskChats } from './task-chats'
import { TaskService } from './task-service'

/** Такт часов заданий и напоминаний: срок «в 9:00» сработает не позже 9:00:20. */
const TICK_MS = 20 * SECOND_MS

/** Первый такт - вскоре после старта: пропущенное, пока IDE была закрыта, наверстывается. */
const FIRST_TICK_MS = 5 * SECOND_MS

export type TasksSetup = {
  claude: ClaudeService
  /** Панели провайдеров: прогоны открываются их вкладками, уведомления отвечают их разговорам. */
  panels: PanelRegistry
  /** Исполнители провайдеров - те же, что у сценариев: прогон идёт на провайдере задания. */
  providers: ReadonlyMap<ProviderId, ScenarioProvider>
  /** Провайдер служебной работы (Settings → AI): проверки поручений и черновики заданий. */
  serviceAi: ServiceAiService
  /** Коннекторы: сторожа поручений, свой сервер поручения и правило отправки (ADR 0080). */
  connectors: ConnectorsService
  workspace: WorkspaceService
  stats: StatsService
  dataDir: string
  getWindow: () => BrowserWindow | null
  /** Все звуки IDE выключены (кнопка в строке состояния): баннер ОС - без своего звука. */
  silent: () => boolean
  /** Связь коннектора уведомлений: сюда встаёт агент уведомлений (ADR 0069). */
  inboxLink: InboxLink
  /** Задания или прогоны поменялись - кроме окна, это видит телефон Remote Control. */
  onTasks: () => void
}

export type Tasks = {
  tasks: TaskService
  inbox: InboxService
  /** ИИ пишет задание из слов человека - для формы, без сохранения. */
  author: TaskAuthor
  shutdown: () => Promise<void>
}

/**
 * Окно на виду - баннер ОС не нужен: карточка уже в углу окна. Все звуки IDE выключены -
 * баннер приходит молча.
 */
const showBanner = (item: InboxItem, getWindow: () => BrowserWindow | null, silent: boolean) => {
  const window = getWindow()

  if (!Notification.isSupported() || window?.isFocused()) return

  const { title, subtitle, body } = bannerOf(item)
  const note = new Notification({ title, subtitle, body, silent })

  note.on('click', () => {
    const shown = getWindow()

    if (shown?.isMinimized()) shown.restore()
    shown?.show()
    shown?.focus()
    broadcast('inbox:reveal', { itemId: item.id })
  })
  note.show()
}

/**
 * Задания по расписанию и уведомления IDE (ADR 0069) - вместе: прогоны спрашивают человека
 * уведомлениями, кнопки уведомлений отвечают прогонам и разговорам панели. Часы тикают сами и
 * ещё раз, когда машина проснулась: срок, проспанный в сне, наверстывается сразу.
 */
export const startTasks = async (setup: TasksSetup): Promise<Tasks> => {
  const { claude, workspace, getWindow, connectors } = setup
  const { book, interrupted } = await TaskBook.load(
    new JsonFile<StoredTasks>(join(setup.dataDir, 'tasks.json')),
  )
  const goalBook = await GoalBook.load(
    new JsonFile<StoredGoals>(join(setup.dataDir, 'goals.json'), { mode: 0o600 }),
  )

  // Жизни, чьих прогонов книга заданий уже не помнит, - не нужны.
  goalBook.keepOnly(new Set(book.runs.map((run) => run.id)))
  const knownFolders = () => {
    const state = workspace.getState()

    return [...state.projects, ...state.recentProjects].map((project) => project.rootPath)
  }
  const work = {
    setting: () => setup.serviceAi.value,
    runner: (id: ProviderId) => setup.providers.get(id) ?? null,
    dataDir: setup.dataDir,
  }
  const chats = taskChats({
    panels: setup.panels,
    provider: (id) => setup.providers.get(id) ?? null,
    workspace,
    runBySession: (sessionId) => tasks.runBySession(sessionId),
  })
  const tasks: TaskService = new TaskService(book, {
    dataDir: setup.dataDir,
    host: { provider: (id) => setup.providers.get(id) ?? null },
    folderKnown: (path) => knownFolders().includes(path),
    openChat: chats.openChat,
    sendToChat: chats.sendToRunChat,
    onState: (state) => {
      broadcast('tasks:changed', state)
      setup.onTasks()
    },
    onRunFinished: (run) => {
      // Статистика знает разговор по id провайдера (поток Codex, сессия OpenCode).
      void setup.providers
        .get(run.provider)
        ?.chatIdOf(run.sessionId)
        .then((chatId) => {
          if (chatId) setup.stats.noteIdeSession(run.provider, chatId, 'task')
        })
    },
    goals: {
      book: goalBook,
      probe: (projectPath, server, tool, args, signal) =>
        connectors.goals.probe({ projectPath, server, tool, args, signal }),
      checker: serviceGoalChecks(
        work,
        claudeGoalChecks(claude, connectors, setup.dataDir, () => setup.serviceAi.value.model),
        (projectPath) => connectors.goals.readTools(projectPath),
      ),
    },
  })
  const goals = tasks.goals.desk

  // Свой сервер поручения - только процессам живых поручений; правило отправки людям - шлюзу.
  connectors.goals.serveIde(
    GOAL_SERVER,
    goalServer(goals, (sessionId) => goals.outboundOf(sessionId) !== null),
  )
  connectors.goals.gate = {
    outboundOf: (sessionId) => goals.outboundOf(sessionId),
    confirm: (sessionId, call, signal) => tasks.goals.confirm(sessionId, call, signal),
  }
  const inbox = await InboxService.load(
    new JsonFile<StoredInbox>(join(setup.dataDir, 'inbox.json')),
    {
      onState: (state) => broadcast('inbox:changed', state),
      onArrived: (item) => {
        broadcast('inbox:arrived', item)
        showBanner(item, getWindow, setup.silent())
      },
    },
  )
  inbox.routes = {
    tasks,
    sendToChat: chats.sendToOrigin,
    trust: (projectPath, runId) => chats.trust(projectPath, tasks.run(runId)),
    openPath: (path) => openOutside(path, false),
    openUrl: openExternalWeb,
  }
  tasks.inbox = inbox
  setup.inboxLink.agent = new InboxAgent(inbox, chats.originOf, (origin) => {
    if (origin.kind === 'task') tasks.noteNotified(origin.runId)
  })

  // Прогоны, которые оборвала закрытая IDE, - уведомлением: продолжить ли. Поручения
  // продолжаются сами (ADR 0080).
  for (const run of interrupted) inbox.finished(run, tasks.task(run.taskId))
  tasks.restoreGoals()

  const tick = () => {
    inbox.tick()
    void tasks.tick().catch((error: unknown) => console.warn('[tasks] такт часов упал:', error))
  }
  const clock = setInterval(tick, TICK_MS)
  const first = setTimeout(tick, FIRST_TICK_MS)

  clock.unref()
  first.unref()
  powerMonitor.on('resume', tick)

  return {
    tasks,
    inbox,
    author: claudeTaskAuthor(
      claude,
      connectors,
      setup.dataDir,
      () => setup.serviceAi.value.model,
      () => serviceAuthorAsk(work),
    ),
    shutdown: () => {
      clearInterval(clock)
      clearTimeout(first)
      powerMonitor.off('resume', tick)
      connectors.goals.gate = null
      setup.inboxLink.agent = null

      return tasks.shutdown()
    },
  }
}
