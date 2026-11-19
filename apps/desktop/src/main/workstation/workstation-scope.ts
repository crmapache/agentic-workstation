import { ArgumentError } from '../connectors/kinds/native-tools'
import type { ScenariosPort, ConversationsPort } from '../remote/bridge/bridge-ports'
import type { TasksPort, ProjectsPort, WorkstationPorts } from './workstation-link'

/** Проект, где человек сузил коннектор самой IDE: разговорам его там не видно. */
const closed = (path: string) =>
  new ArgumentError(`Agentic Workstation is turned off for ${path}: the person chose its projects.`)

const scopedProjects = (
  projects: ProjectsPort,
  allowed: (path: string) => boolean,
): ProjectsPort => ({
  state: () => {
    const state = projects.state()

    return {
      ...state,
      projects: state.projects.filter((project) => allowed(project.rootPath)),
      recentProjects: state.recentProjects.filter((project) => allowed(project.rootPath)),
    }
  },
  open: (rootPath) => {
    if (!allowed(rootPath)) throw closed(rootPath)

    return projects.open(rootPath)
  },
})

/**
 * Сценарии в пределах проектов: очереди и прогоны чужих проектов не видны, действие по id чужой
 * очереди или прогона - отказ. Остальное и так берёт проект через projectOf, а он видит только
 * разрешённые проекты.
 */
const scopedScenarios = (
  scenarios: ScenariosPort,
  allowed: (path: string) => boolean,
): ScenariosPort => {
  const view = () => {
    const all = scenarios.queuesView()

    return {
      queues: all.queues.filter((queue) => allowed(queue.projectPath)),
      live: all.live.filter((run) => allowed(run.projectPath)),
    }
  }
  const queueOf = (queueId: string) => {
    const queue = scenarios.queuesView().queues.find((one) => one.id === queueId)

    if (queue && !allowed(queue.projectPath)) throw closed(queue.projectPath)
  }
  const runOf = (runId: string) => {
    const queue = scenarios
      .queuesView()
      .queues.find((one) => one.items.some((item) => item.runId === runId))

    if (queue && !allowed(queue.projectPath)) throw closed(queue.projectPath)
  }
  const inProject =
    <A extends unknown[], R>(act: (path: string, ...rest: A) => R) =>
    (path: string, ...rest: A): R => {
      if (!allowed(path)) throw closed(path)

      return act(path, ...rest)
    }

  return {
    ...scenarios,
    queuesView: view,
    act: (queueId, action) => {
      queueOf(queueId)

      return scenarios.act(queueId, action)
    },
    carryOn: (runId) => {
      runOf(runId)

      return scenarios.carryOn(runId)
    },
    start: (request) => {
      if (!allowed(request.projectPath)) throw closed(request.projectPath)
      if (request.target.kind === 'queue') queueOf(request.target.queueId)

      return scenarios.start(request)
    },
    run: inProject(scenarios.run),
    control: inProject(scenarios.control),
    answer: inProject(scenarios.answer),
    tell: inProject(scenarios.tell),
    shelves: inProject(scenarios.shelves),
    fetch: inProject(scenarios.fetch),
    save: inProject(scenarios.save),
    delete: inProject(scenarios.delete),
    schedule: inProject(scenarios.schedule),
    unschedule: inProject(scenarios.unschedule),
  }
}

/** Задания и их прогоны - только разрешённых проектов: чужие не видны и по id. */
const scopedTasks = (tasks: TasksPort, allowed: (path: string) => boolean): TasksPort => {
  const taskOf = (taskId: string) => {
    const task = tasks.task(taskId)

    if (task && !allowed(task.projectPath)) throw closed(task.projectPath)
  }
  const runOf = (runId: string) => {
    const run = tasks.run(runId)

    if (run && !allowed(run.projectPath)) throw closed(run.projectPath)
  }

  return {
    view: () => {
      const view = tasks.view()

      return {
        ...view,
        tasks: view.tasks.filter((task) => allowed(task.projectPath)),
        runs: view.runs.filter((run) => allowed(run.projectPath)),
      }
    },
    task: (taskId) => {
      taskOf(taskId)

      return tasks.task(taskId)
    },
    run: (runId) => {
      runOf(runId)

      return tasks.run(runId)
    },
    save: (draft) => {
      if (!allowed(draft.projectPath)) throw closed(draft.projectPath)
      if (draft.id) taskOf(draft.id)

      return tasks.save(draft)
    },
    remove: (taskId) => (taskOf(taskId), tasks.remove(taskId)),
    setEnabled: (taskId, enabled) => (taskOf(taskId), tasks.setEnabled(taskId, enabled)),
    skipNext: (taskId, skip) => (taskOf(taskId), tasks.skipNext(taskId, skip)),
    runNow: (taskId) => (taskOf(taskId), tasks.runNow(taskId)),
    stop: (runId) => (runOf(runId), tasks.stop(runId)),
    tell: (runId, text) => (runOf(runId), tasks.tell(runId, text)),
    wake: (runId) => (runOf(runId), tasks.wake(runId)),
  }
}

/** Панель провайдера, где видны только разговоры разрешённых проектов. */
const scopedPanel = (
  port: ConversationsPort,
  allowed: (path: string) => boolean,
): ConversationsPort => ({
  ...port,
  getState: () => {
    const state = port.getState()

    return {
      ...state,
      conversations: state.conversations.filter((one) => allowed(one.projectPath)),
    }
  },
})

/**
 * Порты самой IDE в пределах проектов, где человек оставил коннектор (ADR 0090): сужение по
 * проектам - не только видимость сервера, но и граница того, чем разговор управляет. Разговор
 * проекта A не трогает очереди, задания и разговоры проекта B, где коннектор выключен.
 */
export const scopedPorts = (
  ports: WorkstationPorts,
  allowed: (path: string) => boolean,
): WorkstationPorts => ({
  projects: scopedProjects(ports.projects, allowed),
  scenarios: scopedScenarios(ports.scenarios, allowed),
  tasks: scopedTasks(ports.tasks, allowed),
  panels: () => ports.panels().map((port) => scopedPanel(port, allowed)),
})
