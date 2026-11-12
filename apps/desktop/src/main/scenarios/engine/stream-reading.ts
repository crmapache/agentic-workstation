import type { CliMessage } from '../../claude/cli/cli-messages'
import { isRecord, recordField, stringField, recordsField } from '../../claude/cli/cli-messages'

/**
 * Что движок читает из потока своих процессов: концовки хода, фоновых помощников и живые
 * слова. Только собственные сообщения сессии - строки субагентов (`parent_tool_use_id`) не её.
 */

const isOwn = (message: CliMessage): boolean => !stringField(message, 'parent_tool_use_id')

/**
 * Ответ хода - все его концовки, а не `result` CLI (TurnEndings в ACC): Stop-хук проекта
 * отправляет агента доработать, и последние слова - про это, а не про работу. Концовка -
 * сообщение со `stop_reason: end_turn`; причина приходит только в `message_delta` потока.
 */
export class TurnEndings {
  private message = ''
  private words = ''
  private going: string[] = []
  /** Концовки последнего законченного хода, старшая первой. */
  last: string[] = []

  read(message: CliMessage): void {
    if (message.type === 'result') this.finish(message)
    else if (message.type === 'assistant' && isOwn(message)) this.gather(message)
    else if (message.type === 'stream_event' && isOwn(message)) this.close(message)
  }

  clear(): void {
    this.message = ''
    this.words = ''
    this.going = []
    this.last = []
  }

  private gather(message: CliMessage) {
    const body = recordField(message, 'message')
    const id = stringField(body, 'id')

    if (id !== this.message) {
      this.message = id
      this.words = ''
    }

    for (const block of recordsField(body, 'content')) {
      const text = block['type'] === 'text' ? stringField(block, 'text').trim() : ''

      if (text) this.words = this.words ? `${this.words}\n\n${text}` : text
    }
  }

  private close(message: CliMessage) {
    const event = recordField(message, 'event')

    if (event['type'] !== 'message_delta') return
    if (stringField(recordField(event, 'delta'), 'stop_reason') !== 'end_turn') return

    if (this.words.trim()) this.going.push(this.words)

    this.message = ''
    this.words = ''
  }

  private finish(result: CliMessage) {
    const said = stringField(result, 'result').trim()
    const endings = [...this.going]

    // Поток без дельт отвечает, как раньше: результат, которого нет в концовках, - рядом.
    if (said && !endings.at(-1)?.includes(said)) endings.push(said)

    this.last = endings
    this.going = []
    this.message = ''
    this.words = ''
  }
}

/** Команду помощника ждём, но не дольше: это может быть и dev-сервер. */
export const HELPERS_COMMAND_MS = 30 * 60 * 1000

/** Кого ждём: агента, workflow, фоновый вызов MCP и задачу без типа (старый CLI). */
const REPORTING = new Set(['', 'local_agent', 'local_workflow', 'mcp_task'])

const flag = (task: Record<string, unknown>, name: string) => task[name] === true

const isLive = (task: Record<string, unknown>) =>
  Boolean(stringField(task, 'task_id')) && !flag(task, 'ambient') && !flag(task, 'skip_transcript')

const waitedFor = (task: Record<string, unknown>) =>
  isLive(task) && REPORTING.has(stringField(task, 'task_type'))

const isCommand = (task: Record<string, unknown>) =>
  isLive(task) && stringField(task, 'task_type') === 'local_bash'

/**
 * Фоновые помощники карточки (BackgroundWork в ACC): конец хода, пока они работают, - ещё не
 * ответ, их отчёты поднимут следующий ход сами. Набор `background_tasks_changed` главнее пар
 * `task_started`/`task_notification`: им заменяют свой набор, а не сводят.
 */
export class BackgroundWork {
  private readonly going = new Set<string>()
  private readonly commands = new Set<string>()
  private readonly helpersCommands = new Map<string, number>()
  private levels = false

  busy(now = Date.now()): boolean {
    return (
      this.going.size > 0 ||
      [...this.commands].some(
        (id) => now - (this.helpersCommands.get(id) ?? -Infinity) < HELPERS_COMMAND_MS,
      )
    )
  }

  /** Ждать перестали, а команда помощника всё ещё шла: отчёт не пришёл. */
  overdue(now = Date.now()): boolean {
    return [...this.commands].some(
      (id) => now - (this.helpersCommands.get(id) ?? Infinity) >= HELPERS_COMMAND_MS,
    )
  }

  read(message: CliMessage, now = Date.now()): void {
    if (message.type !== 'system') return

    const id = stringField(message, 'task_id')

    if (message.subtype === 'background_tasks_changed') {
      const tasks = Array.isArray(message['tasks']) ? message['tasks'].filter(isRecord) : []

      this.levels = true
      this.going.clear()
      this.commands.clear()
      for (const task of tasks.filter(waitedFor)) this.going.add(stringField(task, 'task_id'))
      for (const task of tasks.filter(isCommand)) this.commands.add(stringField(task, 'task_id'))
    } else if (message.subtype === 'task_started') {
      if (isCommand(message) && flag(message, 'owned_by_subagent'))
        this.helpersCommands.set(id, now)
      if (this.levels) return
      if (waitedFor(message)) this.going.add(id)
      if (isCommand(message)) this.commands.add(id)
    } else if (message.subtype === 'task_notification') {
      this.helpersCommands.delete(id)
      if (this.levels) return
      this.going.delete(id)
      this.commands.delete(id)
    }
  }
}

/** Разрыв между блоками текста в живой строке. */
export const BREAK = '\n\n'

/**
 * Кусок живых слов из строки потока (LiveWords в ACC): дельта текста или разрыв на начале
 * нового текстового блока. null - строка не про слова этой сессии.
 */
export const livePiece = (message: CliMessage): string | null => {
  if (message.type !== 'stream_event' || !isOwn(message)) return null

  const event = recordField(message, 'event')

  if (event['type'] === 'content_block_start') {
    return recordField(event, 'content_block')['type'] === 'text' ? BREAK : null
  }

  if (event['type'] !== 'content_block_delta') return null

  const delta = recordField(event, 'delta')

  return delta['type'] === 'text_delta' ? stringField(delta, 'text') || null : null
}

const FENCE = /^[ \t]*(`{3,})([^`]*)$/

/** Открытая ограда кода в тексте - её надо открыть заново, если начало срезано. */
const openFence = (text: string): string | null => {
  let open: string | null = null
  let ticks = 0

  for (const line of text.split('\n')) {
    const match = FENCE.exec(line)

    if (!match) continue

    if (open === null) {
      open = line.trim()
      ticks = match[1]?.length ?? 0
    } else if ((match[1]?.length ?? 0) === ticks && !match[2]?.trim()) {
      open = null
    }
  }

  return open
}

/** Новейшие limit символов, срез - по абзацу, строке или хотя бы слову. */
export const newestWords = (text: string, limit: number): string => {
  if (text.length <= limit) return text

  const from = text.length - limit
  const window = text.slice(from)
  const half = limit / 2
  const near = (found: number) => (found >= 0 && found < half ? found : null)
  const paragraph = near(window.indexOf(BREAK))
  const line = near(window.indexOf('\n'))
  const word = near(window.indexOf(' '))
  const cut =
    paragraph !== null
      ? from + paragraph + BREAK.length
      : line !== null
        ? from + line + 1
        : word !== null
          ? from + word + 1
          : from
  const kept = text.slice(cut).replace(/^\n+/, '')
  const fence = openFence(text.slice(0, cut))

  if (fence) return `${fence}\n${kept}`

  return paragraph === null && line === null ? `...${kept}` : kept
}

/** Добавить кусок к живой строке. */
export const addWords = (said: string, piece: string, limit: number): string => {
  if (piece === BREAK) return said.trim() ? `${said.trimEnd()}${BREAK}` : said

  return newestWords(said + piece, limit)
}
