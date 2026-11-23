import type { CalendarState } from '@shared/calendar'
import type { CalendarMeeting, CalendarOverlap } from '@shared/calendar-overlaps'
import type {
  TrackerOp,
  TrackerBoard,
  TrackerOutcome,
  TrackerSendOutcome,
  TrackerSendRequest,
} from '@shared/tracker'
import type { WorkspaceState } from '@shared/workspace'

import type { ExtensionsService } from '../extensions/extensions-service'
import type { TaskService } from '../tasks/task-service'
import type { TrackerPlace } from '../tracker/tracker-spaces'
import { ArgumentError } from '../connectors/kinds/native-tools'
import type { ScenariosPort, ConversationsPort } from '../remote/bridge/bridge-ports'

/** Проекты IDE: вкладки и недавние, открыть папку вкладкой. */
export type ProjectsPort = {
  state: () => WorkspaceState
  open: (rootPath: string) => Promise<WorkspaceState>
}

/** Задания по расписанию и поручения (ADR 0069, 0080) - те же методы, что у каналов tasks:*. */
export type TasksPort = Pick<
  TaskService,
  | 'view'
  | 'task'
  | 'run'
  | 'save'
  | 'remove'
  | 'setEnabled'
  | 'skipNext'
  | 'runNow'
  | 'stop'
  | 'tell'
  | 'wake'
>

/**
 * Трекер задач (ADR 0101): доска проекта IDE, правка одним действием и отправка карточек в
 * очередь сценариев - те же методы, что у каналов tracker:*.
 */
export type TrackerPort = {
  board: (place: TrackerPlace) => Promise<TrackerBoard>
  apply: (place: TrackerPlace, op: TrackerOp) => Promise<TrackerOutcome>
  send: (place: TrackerPlace, request: TrackerSendRequest) => Promise<TrackerSendOutcome>
  /** Пути проектов, на чьей доске лежит запись; доски никому не заводит. */
  pathsOf: (id: string) => string[]
}

/**
 * Что инструменты самой IDE (ADR 0090) берут у неё - публичные действия сервисов, которыми
 * пользуются окно и телефон Remote Control. Сценарии и разговоры - теми же портами, что у моста
 * телефона: оба - управление IDE извне окна, и правила у них одни.
 */
export type WorkstationPorts = {
  projects: ProjectsPort
  scenarios: ScenariosPort
  tasks: TasksPort
  tracker: TrackerPort
  /** Панели провайдеров по порядку: первой - Claude Code. */
  panels: () => readonly ConversationsPort[]
  /** Расширения IDE (ADR 0091): поднимаются после портов, до того - null. */
  extensions: () => ExtensionsPort | null
  /** Календарь звонков (ADR 0114): на всю IDE, не на проект. */
  calendar: () => CalendarPort | null
}

/** Календарь звонков для ИИ в разговорах: звонки, накладки, синк. */
export type CalendarPort = {
  /** Человек оставил календарь разговорам (переключатель на виде Calendar). */
  shared: () => boolean
  state: () => CalendarState
  meetingsIn: (
    from: number,
    to: number,
  ) => { meetings: CalendarMeeting[]; overlaps: CalendarOverlap[] }
  /** Запустить синк; ответ - сколько источников встало. */
  sync: (withAi: boolean) => number
}

/** Расширения IDE для ИИ, который их пишет: состояние, журнал, перезапуск, команда. */
export type ExtensionsPort = Pick<
  ExtensionsService,
  'state' | 'logsOf' | 'reloadOne' | 'runCommand' | 'tools' | 'callTool'
>

/**
 * Связь коннектора Agentic Workstation с IDE: коннекторы поднимаются раньше сценариев, заданий
 * и панелей-исполнителей, поэтому порты встают сюда позже, а на выходе из IDE снимаются первыми.
 * Нет портов - инструмент говорит модели подождать.
 */
export class WorkstationLink {
  ports: WorkstationPorts | null = null

  get ready(): WorkstationPorts {
    if (!this.ports)
      throw new ArgumentError('The IDE is starting or closing. Try again in a moment.')

    return this.ports
  }
}
