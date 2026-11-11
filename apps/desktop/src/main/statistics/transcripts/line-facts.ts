import {
  editLines,
  patchLines,
  extensionOf,
  writtenLines,
  isNotAuthoredCommand,
} from './edit-lines'

/**
 * Что статистика берёт из разобранной строки транскрипта Claude Code 2.1.x. Формат меняется
 * версиями CLI, поэтому каждое поле читается с проверкой типа, а незнакомое пропускается,
 * не роняя проход.
 */

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Json | undefined, key: string): string =>
  typeof record?.[key] === 'string' ? record[key] : ''

const count = (record: Json | undefined, key: string): number => {
  const value = record?.[key]

  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

const blocks = (body: Json): Json[] => {
  const content = (body['message'] as Json | undefined)?.['content']

  return Array.isArray(content) ? content.filter(isRecord) : []
}

/** Ответ модели: id для склейки строк одного ответа и расход. */
export type AnswerFact = {
  /** message.id + requestId: один ответ пишется несколькими строками с растущим usage. */
  id: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /** Из cacheWrite - запись на час (вдвое дороже базового входа, а не в 1.25 раза). */
  cacheWrite1h: number
  fast: boolean
}

/** Расход ответа или null: не ответ, служебная заглушка CLI, пустой usage. */
export const answerOf = (body: Json): AnswerFact | null => {
  const message = body['message'] as Json | undefined
  const usage = message?.['usage'] as Json | undefined
  const model = text(message, 'model')

  if (!isRecord(usage) || !model || model === '<synthetic>') return null

  const fact = {
    id: `${text(message, 'id') || text(body, 'uuid')}\n${text(body, 'requestId')}`,
    model,
    input: count(usage, 'input_tokens'),
    output: count(usage, 'output_tokens'),
    cacheRead: count(usage, 'cache_read_input_tokens'),
    cacheWrite: count(usage, 'cache_creation_input_tokens'),
    cacheWrite1h: count(usage['cache_creation'] as Json | undefined, 'ephemeral_1h_input_tokens'),
    fast: usage['speed'] === 'fast',
  }

  return fact.input + fact.output + fact.cacheRead + fact.cacheWrite > 0 ? fact : null
}

/** Вызов инструмента из ответа модели. */
export type ToolUseFact = { id: string; name: string; input: Json }

export const toolUsesOf = (body: Json): ToolUseFact[] =>
  blocks(body)
    .filter((block) => block['type'] === 'tool_use' || block['type'] === 'server_tool_use')
    .map((block) => ({
      id: text(block, 'id'),
      name: text(block, 'name'),
      input: isRecord(block['input']) ? block['input'] : {},
    }))
    .filter((use) => use.id && use.name)

/** Сервер MCP из имени инструмента: mcp__<сервер>__<инструмент>. */
export const mcpServerOf = (name: string): string | null => {
  if (!name.startsWith('mcp__')) return null

  const end = name.indexOf('__', 5)

  return end > 5 ? name.slice(5, end) : null
}

/** Вызов Bash, чьи изменения файлов - не код агента (git, форматтер, пакеты). */
export const skipsEdits = (use: ToolUseFact): boolean =>
  use.name === 'Bash' && isNotAuthoredCommand(text(use.input, 'command'))

/** Результат вызова: какой вызов и не ошибка ли он. */
export type ToolResultFact = { id: string; isError: boolean }

export const toolResultsOf = (body: Json): ToolResultFact[] =>
  blocks(body)
    .filter((block) => block['type'] === 'tool_result')
    .map((block) => ({ id: text(block, 'tool_use_id'), isError: block['is_error'] === true }))
    .filter((result) => result.id)

/**
 * Начало хода: 'human' - сообщение человека, 'auto' - ход начал не человек (служебная
 * вставка CLI, уведомление о фоновой задаче, расписание /loop, команда вроде /model);
 * null - не начало хода (результат инструмента, отметка «прерван»).
 */
export type PromptKind = 'human' | 'auto' | null

/** Ходы, начатые не человеком: поле turnOrigin CLI. */
const AUTO_ORIGINS = new Set(['scheduled', 'task_notification', 'peer', 'system', 'coordinator'])

/** Текст, который вставляет CLI или IDE, а не человек. */
const MACHINE_PREFIXES = [
  '<task-notification',
  '<local-command',
  '<command-name>',
  '<panel-carry-on',
  '<system-reminder',
  '<bash-input',
  '<bash-stdout',
  '<bash-stderr',
]

const promptText = (body: Json): string | null => {
  const content = (body['message'] as Json | undefined)?.['content']

  if (typeof content === 'string') return content

  const parts = blocks(body)

  if (parts.some((block) => block['type'] === 'tool_result')) return null

  const first = parts.find((block) => block['type'] === 'text')

  if (first) return text(first, 'text')

  // Только картинка без слов - тоже сообщение человека.
  return parts.some((block) => block['type'] === 'image') ? '[image]' : ''
}

export const promptKindOf = (body: Json): PromptKind => {
  const said = promptText(body)

  if (said === null || said.trim() === '') return null
  if (said.startsWith('[Request interrupted')) return null

  const automatic =
    body['isMeta'] === true ||
    body['isCompactSummary'] === true ||
    body['isVisibleInTranscriptOnly'] === true ||
    body['promptSource'] === 'system' ||
    body['origin'] !== undefined ||
    AUTO_ORIGINS.has(text(body, 'turnOrigin')) ||
    MACHINE_PREFIXES.some((prefix) => said.startsWith(prefix))

  return automatic ? 'auto' : 'human'
}

/**
 * Решение человека по вопросу разрешения, записанное CLI у результата инструмента.
 * user_temporary - «разрешить раз», user_reject - отказ; user_permanent с reasonType rule -
 * правило, которое человек завёл раньше: его в этот раз не спрашивали.
 */
export const permissionOf = (body: Json): 'allow' | 'deny' | null => {
  const decision = body['permissionDecision']

  if (!isRecord(decision)) return null

  const source = text(decision, 'source')

  if (source === 'user_reject') return 'deny'
  if (source === 'user_temporary') return 'allow'
  if (source === 'user_permanent' && text(decision, 'reasonType') !== 'rule') return 'allow'

  return null
}

/** Правка одного файла. */
export type EditFact = { path: string; ext: string; tool: string; added: number; removed: number }

/** Инструменты правки, у которых можно досчитать строки по входу вызова. */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])

/** Что за инструмент, если вызов не виден (дочитан в прошлый раз и забыт). */
const toolByResult = (result: Json): string => {
  if (Array.isArray(result['edits'])) return 'MultiEdit'
  if (typeof result['oldString'] === 'string') return 'Edit'
  if (typeof result['content'] === 'string') return 'Write'

  return 'Edit'
}

const fact = (path: string, tool: string, added: number, removed: number): EditFact => ({
  path,
  ext: extensionOf(path),
  tool,
  added,
  removed,
})

/** Строки по входу вызова - когда CLI не приложил разность. */
const editsByInput = (use: ToolUseFact): EditFact[] => {
  const path = text(use.input, 'file_path')

  if (use.name === 'Write')
    return [fact(path, 'Write', writtenLines(text(use.input, 'content')), 0)]

  const pieces =
    use.name === 'MultiEdit'
      ? (Array.isArray(use.input['edits']) ? use.input['edits'] : []).filter(isRecord)
      : [use.input]
  const changes = pieces.map((piece) =>
    editLines(text(piece, 'old_string'), text(piece, 'new_string')),
  )

  return [
    fact(
      path,
      use.name,
      changes.reduce((sum, change) => sum + change.added, 0),
      changes.reduce((sum, change) => sum + change.removed, 0),
    ),
  ]
}

/**
 * Правки успешного вызова по его toolUseResult. Bash - разность файлов после команды
 * (bashEditDiff), если команда не из NOT_AUTHORED. Ошибку вызывающий отсеивает сам.
 */
export const editsOf = (
  result: unknown,
  use: { name: string; skipEdits: boolean; input?: Json } | null,
): EditFact[] => {
  if (!isRecord(result)) return []

  const bash = result['bashEditDiff']

  if (isRecord(bash)) {
    if (use?.skipEdits) return []

    return (Array.isArray(bash['files']) ? bash['files'] : []).filter(isRecord).map((file) => {
      const change = patchLines(file['hunks'])

      return fact(text(file, 'filePath'), 'Bash', change.added, change.removed)
    })
  }

  const path = text(result, 'filePath')
  const tool = use?.name || toolByResult(result)

  if (Array.isArray(result['structuredPatch'])) {
    const change = patchLines(result['structuredPatch'])
    const created = result['type'] === 'create' && change.added === 0

    // Новый файл CLI отдаёт пустой разностью: строки - его содержимое.
    if (created) return [fact(path, tool, writtenLines(text(result, 'content')), 0)]

    return [fact(path, tool, change.added, change.removed)]
  }

  if (typeof result['oldString'] === 'string') {
    const change = editLines(result['oldString'], text(result, 'newString'))

    return [fact(path, tool, change.added, change.removed)]
  }

  if (use?.input && EDIT_TOOLS.has(use.name))
    return editsByInput({ id: '', ...use, input: use.input })

  return []
}
