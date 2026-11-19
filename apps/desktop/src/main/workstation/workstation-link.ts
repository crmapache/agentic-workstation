import type { WorkspaceState } from '@shared/workspace'

import type { ExtensionsService } from '../extensions/extensions-service'
import type { TaskService } from '../tasks/task-service'
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
 * Что инструменты самой IDE (ADR 0090) берут у неё - публичные действия сервисов, которыми
 * пользуются окно и телефон Remote Control. Сценарии и разговоры - теми же портами, что у моста
 * телефона: оба - управление IDE извне окна, и правила у них одни.
 */
export type WorkstationPorts = {
  projects: ProjectsPort
  scenarios: ScenariosPort
  tasks: TasksPort
  /** Панели провайдеров по порядку: первой - Claude Code. */
  panels: () => readonly ConversationsPort[]
  /** Расширения IDE (ADR 0091): поднимаются после портов, до того - null. */
  extensions: () => ExtensionsPort | null
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
