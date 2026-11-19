/**
 * Разовый вопрос провайдеру со структурным ответом (служебные задачи IDE: имя очереди, проверка
 * цели, черновики; docs/plan-providers/50-ide.md). Свой разговор без вкладки и без следа в
 * истории, ответ - JSON по схеме.
 */
export type AskOnce = {
  prompt: string
  /** Системные указания разговору (автор сценария); нет - только промпт. */
  system?: string | undefined
  /** JSON Schema ответа; нет - ответ текстом, JSON из него достаёт спросивший. */
  schema?: Record<string, unknown> | undefined
  /** Пусто - модель провайдера по умолчанию. */
  model: string
  effort: string
  /** Папка разговора: своя пустая - без хуков и правил чужого проекта. */
  cwd: string
  timeoutMs: number
  /** Человек отменил: разговор гаснет сразу. */
  signal?: AbortSignal | undefined
  /**
   * Что модели можно сверх чтения: веб (поиск, страница) и инструменты чтения коннекторов
   * проекта - поимённо (`mcp__<сервер>__<инструмент>`), всё прочее ей отказано. Нет - ничего.
   */
  tools?:
    { web: boolean; mcp: { projectPath: string; tools: readonly string[] } | null } | undefined
  /**
   * Модели нужно читать проект своими инструментами (автор сценария): командная строка при
   * этом остаётся, но только чтение и без веба. Нет - ни командной строки, ни файлов.
   */
  readProject?: boolean | undefined
}

/**
 * Схема ответа словами в сообщении - тем, кто не держит её сам (OpenCode) или держит только
 * строгую (Codex: OpenAI в строгом режиме не берёт необязательные поля, oneOf и длины).
 */
export const schemaNote = (schema: Record<string, unknown>): string =>
  `Reply with a single JSON object that matches this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`

/** Инструменты чтения по серверам: `mcp__<сервер>__<инструмент>` - сервер и его инструменты. */
export const toolsByServer = (tools: readonly string[]): Map<string, string[]> => {
  const byServer = new Map<string, string[]>()

  for (const tool of tools) {
    const [, server = '', name = ''] = /^mcp__(.+?)__(.+)$/.exec(tool) ?? []

    if (server && name) byServer.set(server, [...(byServer.get(server) ?? []), name])
  }

  return byServer
}

/** Ответ: текст модели и JSON из него (null - не JSON) или причина, почему ответа нет. */
export type AskOnceResult = { text: string; output: unknown } | { error: string }

/** JSON из ответа модели: целиком или первый объект в тексте (модель могла обрамить его словами). */
export const jsonOf = (said: string): unknown => {
  const text = said.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')

  try {
    return JSON.parse(text) as unknown
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')

    if (start < 0 || end <= start) return null

    try {
      return JSON.parse(text.slice(start, end + 1)) as unknown
    } catch {
      return null
    }
  }
}
