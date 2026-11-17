import { join, basename } from 'node:path'

import type { BrowserWindow } from 'electron'
import { Notification, powerMonitor } from 'electron'

import type { InboxItem } from '@shared/inbox'
import { SECOND_MS } from '@shared/time-units'

import type { ClaudeService } from '../claude/claude-service'
import type { ConnectorsService } from '../connectors/connectors-service'
import { openOutside } from '../fs/outside-open'
import { GoalBook } from '../goals/goal-book'
import type { StoredGoals } from '../goals/goal-book'
import { GOAL_SERVER } from '../goals/goal-briefing'
import { goalServer } from '../goals/goal-tools'
import { InboxAgent } from '../inbox/inbox-agent'
import type { InboxLink, AgentCaller, AgentOrigin } from '../inbox/inbox-agent'
import { bannerOf } from '../inbox/inbox-banner'
import { InboxService } from '../inbox/inbox-service'
import type { ChatOrigin, StoredInbox } from '../inbox/inbox-service'
import { broadcast } from '../ipc/broadcast'
import type { StatsService } from '../statistics/stats-service'
import { JsonFile } from '../storage/json-file'
import { openExternalWeb } from '../window/open-external'
import type { WorkspaceService } from '../workspace/workspace-service'
import { claudeGoalChecks } from '../providers/claude/claude-goal-checks'
import { claudeSessions } from '../providers/claude/claude-sessions'
import { claudeTaskAuthor } from '../providers/claude/claude-task-author'
import type { TaskAuthor } from './task-author'
import { TaskBook } from './task-book'
import type { StoredTasks } from './task-book'
import { TaskService } from './task-service'

/** Такт часов заданий и напоминаний: срок «в 9:00» сработает не позже 9:00:20. */
const TICK_MS = 20 * SECOND_MS

/** Первый такт - вскоре после старта: пропущенное, пока IDE была закрыта, наверстывается. */
const FIRST_TICK_MS = 5 * SECOND_MS

export type TasksSetup = {
  claude: ClaudeService
  /** Коннекторы: сторожа поручений, свой сервер поручения и правило отправки (ADR 0080). */
  connectors: ConnectorsService
  workspace: WorkspaceService
  stats: StatsService
  dataDir: string
  getWindow: () => BrowserWindow | null
  /** Связь коннектора уведомлений: сюда встаёт агент уведомлений (ADR 0069). */
  inboxLink: InboxLink
}

export type Tasks = {
  tasks: TaskService
  inbox: InboxService
  /** ИИ пишет задание из слов человека - для формы, без сохранения. */
  author: TaskAuthor
  shutdown: () => void
}

/** Окно на виду - баннер ОС не нужен: карточка уже в углу окна. */
const showBanner = (item: InboxItem, getWindow: () => BrowserWindow | null) => {
  const window = getWindow()

  if (!Notification.isSupported() || window?.isFocused()) return

  const { title, subtitle, body } = bannerOf(item)
  const note = new Notification({ title, subtitle, body })

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
  const tasks = new TaskService(book, {
    dataDir: setup.dataDir,
    host: {
      sessions: claudeSessions(claude),
      defaults: () => {
        const prefs = claude.panel.newTabPrefs(claude.settings.prefs)

        return { model: prefs.newTabModel ?? '', effort: prefs.newTabEffort ?? '' }
      },
      accountId: () => claude.accounts.current,
    },
    folderKnown: (path) => knownFolders().includes(path),
    openChat: async (projectPath, sessionId) => {
      try {
        await workspace.openProject(projectPath)
        await claude.openHistory(projectPath, sessionId)

        return true
      } catch {
        return false
      }
    },
    sendToChat: async (sessionId, text) => {
      const chat = claude.getState().conversations.find((one) => one.sessionId === sessionId)

      if (!chat) return false

      await claude.actions.send(chat.id, { text, images: [] })

      return true
    },
    onState: (state) => broadcast('tasks:changed', state),
    onRunFinished: (run) => {
      if (run.sessionId) setup.stats.noteIdeSession('claude', run.sessionId, 'task')
    },
    goals: {
      book: goalBook,
      probe: (projectPath, server, tool, args, signal) =>
        connectors.goals.probe({ projectPath, server, tool, args, signal }),
      checker: claudeGoalChecks(claude, connectors, setup.dataDir),
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
        showBanner(item, getWindow)
      },
    },
  )
  const sendToChat = async (origin: ChatOrigin, projectPath: string, text: string) => {
    const find = () =>
      claude
        .getState()
        .conversations.find(
          (one) => one.id === origin.conversationId || one.sessionId === origin.sessionId,
        )?.id
    let id = find()

    // Вкладку закрыли - разговор поднимается из истории той же вкладкой.
    if (!id)
      id = await claude.openHistory(projectPath, origin.sessionId).then(find, () => undefined)
    if (!id) return false

    await claude.actions.send(id, { text, images: [] })

    return true
  }
  const originOf = ({ projectPath, conversationId }: AgentCaller): AgentOrigin => {
    const run = conversationId ? tasks.runBySession(conversationId) : null

    if (run)
      return { origin: { kind: 'task', taskId: run.taskId, runId: run.id }, source: run.taskName }

    const chat = claude.getState().conversations.find((one) => one.id === conversationId)

    if (chat) {
      return {
        origin: { kind: 'chat', conversationId: chat.id, sessionId: chat.sessionId },
        source: chat.title || basename(projectPath),
      }
    }

    return { origin: { kind: 'none' }, source: basename(projectPath) }
  }

  inbox.routes = {
    tasks,
    sendToChat,
    trust: (projectPath) => claude.trustProject(projectPath),
    openPath: (path) => openOutside(path, false),
    openUrl: openExternalWeb,
  }
  tasks.inbox = inbox
  setup.inboxLink.agent = new InboxAgent(inbox, originOf, (origin) => {
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
    author: claudeTaskAuthor(claude, connectors, setup.dataDir),
    shutdown: () => {
      clearInterval(clock)
      clearTimeout(first)
      powerMonitor.off('resume', tick)
      tasks.shutdown()
      connectors.goals.gate = null
      setup.inboxLink.agent = null
    },
  }
}
