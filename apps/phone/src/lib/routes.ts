export type ShelfScope = 'project' | 'user'

/**
 * Экраны телефона - адресами: назад и вперёд работают, как в любом браузере, а открытый
 * разговор переживает перезагрузку. Релей отдаёт оболочку на любой адрес, что не файл.
 * Идентификаторы в адресе - те, что назвала IDE: адрес IDE, ключ проекта, id разговора,
 * очереди, прогона, сценария и ключ шага. Путей на диске в них нет.
 */
export type Route =
  | { name: 'machines' }
  | { name: 'pair' }
  | { name: 'project'; agentId: string; projectKey: string }
  | { name: 'board'; agentId: string }
  | { name: 'accounts'; agentId: string }
  | { name: 'connectors'; agentId: string }
  | { name: 'history'; agentId: string; projectKey: string }
  | { name: 'search'; agentId: string; projectKey: string }
  | { name: 'newConversation'; agentId: string; projectKey: string }
  /** scenario - `scope:id` сценария, выбранного заранее (со страницы сценария). */
  | { name: 'startScenario'; agentId: string; projectKey: string; scenario?: string }
  | { name: 'scenarios'; agentId: string; projectKey: string }
  | { name: 'scenario'; agentId: string; projectKey: string; scope: ShelfScope; scenarioId: string }
  | { name: 'schedule'; agentId: string; projectKey: string; scope: ShelfScope; scenarioId: string }
  | { name: 'draft'; agentId: string; projectKey: string }
  | { name: 'conversation'; agentId: string; projectKey: string; conversationId: string }
  | { name: 'queue'; agentId: string; projectKey: string; queueId: string }
  | { name: 'run'; agentId: string; projectKey: string; runId: string }
  | { name: 'stepLog'; agentId: string; projectKey: string; runId: string; stepKey: string }
  | { name: 'notFound' }

const SEGMENT = '([A-Za-z0-9_*-]{1,80})'

const SCOPE = '(project|user)'

/**
 * Ключ шага прогона - `этап:карточка:проход` или `head`: в адресе он закодирован
 * (encodeURIComponent), поэтому в куске есть `%`. Раскодированный не длиннее STEP_KEY протокола.
 */
const STEP_SEGMENT = '([A-Za-z0-9_*%.~-]{1,600})'

const STEP_KEY_MAX = 200

const PROJECT = `^/m/${SEGMENT}/p/${SEGMENT}`

/** Ключ шага из адреса; кривой код или слишком длинный - null, экран не найден. */
const decodeStepKey = (raw: string): string | null => {
  try {
    const key = decodeURIComponent(raw)

    return key.length > 0 && key.length <= STEP_KEY_MAX ? key : null
  } catch {
    return null
  }
}

const asScope = (value: string): ShelfScope => (value === 'user' ? 'user' : 'project')

const PATTERNS: [RegExp, (parts: string[]) => Route][] = [
  [/^\/$/, () => ({ name: 'machines' })],
  [/^\/pair$/, () => ({ name: 'pair' })],
  [new RegExp(`^/m/${SEGMENT}/queues$`), ([agentId = '']) => ({ name: 'board', agentId })],
  [new RegExp(`^/m/${SEGMENT}/accounts$`), ([agentId = '']) => ({ name: 'accounts', agentId })],
  [new RegExp(`^/m/${SEGMENT}/connectors$`), ([agentId = '']) => ({ name: 'connectors', agentId })],
  [
    new RegExp(`${PROJECT}/search$`),
    ([agentId = '', projectKey = '']) => ({ name: 'search', agentId, projectKey }),
  ],
  [
    new RegExp(`${PROJECT}/scenarios$`),
    ([agentId = '', projectKey = '']) => ({ name: 'scenarios', agentId, projectKey }),
  ],
  [
    new RegExp(`${PROJECT}/draft$`),
    ([agentId = '', projectKey = '']) => ({ name: 'draft', agentId, projectKey }),
  ],
  [
    new RegExp(`${PROJECT}/s/${SCOPE}/${SEGMENT}$`),
    ([agentId = '', projectKey = '', scope = '', scenarioId = '']) => ({
      name: 'scenario',
      agentId,
      projectKey,
      scope: asScope(scope),
      scenarioId,
    }),
  ],
  [
    new RegExp(`${PROJECT}/schedule/${SCOPE}/${SEGMENT}$`),
    ([agentId = '', projectKey = '', scope = '', scenarioId = '']) => ({
      name: 'schedule',
      agentId,
      projectKey,
      scope: asScope(scope),
      scenarioId,
    }),
  ],
  [
    new RegExp(`${PROJECT}/start/${SCOPE}/${SEGMENT}$`),
    ([agentId = '', projectKey = '', scope = '', scenarioId = '']) => ({
      name: 'startScenario',
      agentId,
      projectKey,
      scenario: `${scope}:${scenarioId}`,
    }),
  ],
  [
    new RegExp(`${PROJECT}/r/${SEGMENT}/log/${STEP_SEGMENT}$`),
    ([agentId = '', projectKey = '', runId = '', raw = '']) => {
      const stepKey = decodeStepKey(raw)

      return stepKey === null
        ? { name: 'notFound' }
        : { name: 'stepLog', agentId, projectKey, runId, stepKey }
    },
  ],
  [
    new RegExp(`^/m/${SEGMENT}/p/${SEGMENT}/history$`),
    ([agentId = '', projectKey = '']) => ({ name: 'history', agentId, projectKey }),
  ],
  [
    new RegExp(`^/m/${SEGMENT}/p/${SEGMENT}$`),
    ([agentId = '', projectKey = '']) => ({ name: 'project', agentId, projectKey }),
  ],
  [
    new RegExp(`^/m/${SEGMENT}/p/${SEGMENT}/new$`),
    ([agentId = '', projectKey = '']) => ({ name: 'newConversation', agentId, projectKey }),
  ],
  [
    new RegExp(`^/m/${SEGMENT}/p/${SEGMENT}/start$`),
    ([agentId = '', projectKey = '']) => ({ name: 'startScenario', agentId, projectKey }),
  ],
  [
    new RegExp(`^/m/${SEGMENT}/p/${SEGMENT}/c/${SEGMENT}$`),
    ([agentId = '', projectKey = '', conversationId = '']) => ({
      name: 'conversation',
      agentId,
      projectKey,
      conversationId,
    }),
  ],
  [
    new RegExp(`^/m/${SEGMENT}/p/${SEGMENT}/q/${SEGMENT}$`),
    ([agentId = '', projectKey = '', queueId = '']) => ({
      name: 'queue',
      agentId,
      projectKey,
      queueId,
    }),
  ],
  [
    new RegExp(`^/m/${SEGMENT}/p/${SEGMENT}/r/${SEGMENT}$`),
    ([agentId = '', projectKey = '', runId = '']) => ({ name: 'run', agentId, projectKey, runId }),
  ],
]

export const parseRoute = (path: string): Route => {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path

  for (const [pattern, build] of PATTERNS) {
    const match = pattern.exec(clean)

    if (match) return build(match.slice(1))
  }

  return { name: 'notFound' }
}

export const routePath = (route: Route): string => {
  switch (route.name) {
    case 'machines':
    case 'notFound':
      return '/'
    case 'pair':
      return '/pair'
    case 'project':
      return `/m/${route.agentId}/p/${route.projectKey}`
    case 'board':
      return `/m/${route.agentId}/queues`
    case 'accounts':
      return `/m/${route.agentId}/accounts`
    case 'connectors':
      return `/m/${route.agentId}/connectors`
    case 'history':
      return `/m/${route.agentId}/p/${route.projectKey}/history`
    case 'search':
      return `/m/${route.agentId}/p/${route.projectKey}/search`
    case 'newConversation':
      return `/m/${route.agentId}/p/${route.projectKey}/new`
    case 'startScenario':
      return `/m/${route.agentId}/p/${route.projectKey}/start${
        route.scenario ? `/${route.scenario.replace(':', '/')}` : ''
      }`
    case 'scenarios':
      return `/m/${route.agentId}/p/${route.projectKey}/scenarios`
    case 'scenario':
      return `/m/${route.agentId}/p/${route.projectKey}/s/${route.scope}/${route.scenarioId}`
    case 'schedule':
      return `/m/${route.agentId}/p/${route.projectKey}/schedule/${route.scope}/${route.scenarioId}`
    case 'draft':
      return `/m/${route.agentId}/p/${route.projectKey}/draft`
    case 'conversation':
      return `/m/${route.agentId}/p/${route.projectKey}/c/${route.conversationId}`
    case 'queue':
      return `/m/${route.agentId}/p/${route.projectKey}/q/${route.queueId}`
    case 'run':
      return `/m/${route.agentId}/p/${route.projectKey}/r/${route.runId}`
    case 'stepLog':
      return `/m/${route.agentId}/p/${route.projectKey}/r/${route.runId}/log/${encodeURIComponent(route.stepKey)}`
  }
}

/**
 * Куда ведёт «назад», если пришли не изнутри приложения (открыли адрес из закладки): экран
 * машины - к машинам, сценарий - к полкам, расписание - к сценарию, журнал шага - к прогону,
 * остальное - к проекту.
 */
export const parentOf = (route: Route): Route => {
  switch (route.name) {
    case 'machines':
    case 'pair':
    case 'notFound':
    case 'project':
    case 'board':
    case 'accounts':
    case 'connectors':
      return { name: 'machines' }
    case 'scenario':
      return { name: 'scenarios', agentId: route.agentId, projectKey: route.projectKey }
    case 'schedule':
      return { ...route, name: 'scenario' }
    case 'stepLog':
      return {
        name: 'run',
        agentId: route.agentId,
        projectKey: route.projectKey,
        runId: route.runId,
      }
    default:
      return { name: 'project', agentId: route.agentId, projectKey: route.projectKey }
  }
}
