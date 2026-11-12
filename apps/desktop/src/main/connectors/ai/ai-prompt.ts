import type { GenerateConnectorRequest } from '@shared/connector-spec'
import type { ImportCandidate } from '@shared/connectors'

/**
 * Встроенные коннекторы IDE (каталог Connectors): их ИИ не строит заново, а называет. Имена -
 * как на плитках каталога.
 */
const BUILT_IN = [
  'Gmail',
  'Google Calendar',
  'Notion',
  'Slack',
  'Jira & Confluence',
  'Todoist',
  'Playwright',
  'Browser',
]

const SPEC_RULES = [
  '- Only the official HTTPS REST API. baseUrl has no query string; tool paths start with "/" and are relative to baseUrl.',
  '- Auth must be a key the person can create themselves in their account: API key or personal access token as a Bearer header ("bearer"), a custom header ("header" with its name), a query parameter ("query" with its name), or login and password ("basic"). "none" only for fully public APIs.',
  '- Up to 20 tools that cover what the person wants; prefer reading tools. One tool is one HTTP request.',
  '- access: "read" for requests without side effects; "write" for creating or changing the person\'s own data; "outbound" for anything other people will see or receive: sending messages or emails, posting, commenting, inviting, sharing, replying.',
  '- Tool and argument names are snake_case. Describe every argument in inputSchema (JSON Schema, type object) with a clear description; put path arguments in the path as {name}; list in "query" the arguments that go to the query string and in "body" those that go to the JSON body.',
  '- Descriptions are short and say what the tool returns.',
  '- authHelp: one or two sentences on where exactly the person creates the key.',
]

/** Сервер человека строкой для ИИ: имя, чем работает (ключи уже замаскированы), где виден. */
const serverLine = (candidate: ImportCandidate): string => {
  const how =
    candidate.kind === 'mcp'
      ? `remote MCP server at ${candidate.target}`
      : `local MCP command ${candidate.target}`
  const where = candidate.projectPath ? `project ${candidate.projectPath}` : 'all projects'
  const taken = candidate.blocked === 'taken' ? ' (already a connector in the IDE)' : ''

  return `- ${candidate.name}: ${how}, ${where}${taken}`
}

/**
 * Правила для ИИ - в системный промпт разговора (ADR 0050). Порядок проверок - от того, что у
 * человека уже есть, к сети: свой продукт человека в интернете не найти, а в его Claude Code
 * он уже настроен. Серверы - из конфига Claude Code без ключей: адреса и команды замаскированы
 * переносом (import-candidates.ts).
 */
export const aiInstructions = (candidates: readonly ImportCandidate[]): string => {
  const servers = candidates.filter((candidate) => candidate.blocked !== 'bad-name')

  return [
    'You help a person connect a service to the AI assistant of their IDE, Agentic Workstation. The IDE calls it a connector.',
    'The person watches this chat live and can write to you at any time, also while you work. Their messages are in the chat; answer them.',
    '',
    'Every turn ends with an answer in the required structure:',
    '- outcome "existing": the service is already set up as an MCP server in the person\'s Claude Code settings (list below). Put its exact name in "existing". The IDE moves it over with its saved sign-in; you never see keys.',
    '- outcome "mcp": the service has an official remote MCP server. Put its HTTPS URL in "mcp" with auth "oauth" if it signs in through the browser, "token" if it takes an API key or token in the Authorization header, "none" if it is open.',
    '- outcome "http": there is no MCP server, but there is an official REST API with a personal key. Describe it in "spec" by the rules below.',
    '- outcome "none": nothing to add yet: you need an answer from the person, or the service can\'t be connected.',
    '"message" is what you tell the person: short, plain, in the language they write in. With a proposal, say what it gives and what they need to do next, for example where to create the key.',
    'Write nothing to the person outside the answer: the chat shows "message" as your reply, and any other text would repeat it.',
    '',
    'Check in this order:',
    '1. The person\'s MCP servers below. If one of them is this service (by name, address or the person\'s words), answer "existing". People connect their own products this way: such a product is often not on the web at all.',
    `2. Connectors built into the IDE: ${BUILT_IN.join(', ')}. If the service is one of them, answer "none" and tell the person to add the built-in one from the catalog.`,
    '3. An official remote MCP server of the service, from its documentation: answer "mcp".',
    '4. The official REST API with a personal key: answer "http".',
    "If the name is ambiguous (several products share it) or you can't find the service, don't give up: ask the person, for example for a link to the product or its API docs. If the service only allows OAuth apps without an MCP server, say so and why.",
    '',
    'Rules for "spec":',
    ...SPEC_RULES,
    '',
    "The person's MCP servers from Claude Code settings (keys are hidden):",
    ...(servers.length > 0 ? servers.map(serverLine) : ['(none)']),
  ].join('\n')
}

/**
 * Первое сообщение разговора - просьба человека, как он её написал: его видно в ленте как
 * сказанное им, правила для ИИ - отдельно, в системном промпте.
 */
export const firstMessage = (request: GenerateConnectorRequest): string =>
  [
    `Service: ${request.service}`,
    request.goal.trim() ? `What it should do: ${request.goal.trim()}` : '',
    request.docsUrl ? `API docs: ${request.docsUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n')
