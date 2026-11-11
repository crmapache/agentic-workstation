/**
 * Экраны телефона - адресами: назад и вперёд работают, как в любом браузере, а открытый
 * разговор переживает перезагрузку. Релей отдаёт оболочку на любой адрес, что не файл.
 * Идентификаторы в адресе - те, что назвала IDE: адрес IDE, ключ проекта, id разговора,
 * очереди и прогона. Путей на диске в них нет.
 */
export type Route =
  | { name: 'machines' }
  | { name: 'pair' }
  | { name: 'project'; agentId: string; projectKey: string }
  | { name: 'newConversation'; agentId: string; projectKey: string }
  | { name: 'startScenario'; agentId: string; projectKey: string }
  | { name: 'conversation'; agentId: string; projectKey: string; conversationId: string }
  | { name: 'queue'; agentId: string; projectKey: string; queueId: string }
  | { name: 'run'; agentId: string; projectKey: string; runId: string }
  | { name: 'notFound' }

const SEGMENT = '([A-Za-z0-9_*-]{1,80})'

const PATTERNS: [RegExp, (parts: string[]) => Route][] = [
  [/^\/$/, () => ({ name: 'machines' })],
  [/^\/pair$/, () => ({ name: 'pair' })],
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
    case 'newConversation':
      return `/m/${route.agentId}/p/${route.projectKey}/new`
    case 'startScenario':
      return `/m/${route.agentId}/p/${route.projectKey}/start`
    case 'conversation':
      return `/m/${route.agentId}/p/${route.projectKey}/c/${route.conversationId}`
    case 'queue':
      return `/m/${route.agentId}/p/${route.projectKey}/q/${route.queueId}`
    case 'run':
      return `/m/${route.agentId}/p/${route.projectKey}/r/${route.runId}`
  }
}

/** Куда ведёт «назад», если пришли не изнутри приложения (открыли адрес из закладки). */
export const parentOf = (route: Route): Route => {
  switch (route.name) {
    case 'machines':
    case 'pair':
    case 'notFound':
    case 'project':
      return { name: 'machines' }
    default:
      return { name: 'project', agentId: route.agentId, projectKey: route.projectKey }
  }
}
