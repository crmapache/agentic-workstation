import type { FeedItem, ToolInput, FileChange, ToolFeedItem } from '@shared/claude-feed'

import { isRecord } from '../cli/cli-messages'
import { EDIT_TOOL_PATH_FIELD } from './changes.constants'
import { lineDiff } from './line-diff'
import type { EditEntry } from './turn-edits'
import { hunkCounts } from './turn-settle'

/** Что одна правка дала строке файла - без отметок отката. */
type ToolChange = Omit<FileChange, 'reverted' | 'refusal'>

type Counts = Pick<FileChange, 'added' | 'removed' | 'created' | 'counted'>

/** Так Write говорит текстом, что создал файл, - читается, только когда структуры нет. */
const CREATED_TEXT = /^File created successfully/

const UNCOUNTED: Counts = { added: 0, removed: 0, created: false, counted: false }

const text = (input: ToolInput, key: string) => {
  const value = input[key]

  return typeof value === 'string' ? value : ''
}

const lineCount = (value: string) => (value ? value.replace(/\n+$/, '').split('\n').length : 0)

/** Пара «было - стало» правки, посчитанная так же, как её дифф на карточке. */
const pairCounts = (pair: ToolInput): Counts => {
  if (pair['replace_all'] === true) return UNCOUNTED

  return {
    ...hunkCounts(lineDiff(text(pair, 'old_string'), text(pair, 'new_string')) ?? []),
    created: false,
    counted: true,
  }
}

/**
 * Цифры по самому вызову - для результата без диффа CLI: старый CLI, несколько
 * результатов одним сообщением (undiffed false) или большая правка, которую CLI прислал с
 * пустым диффом (undiffed true). У большой по вызову считается только одиночная замена;
 * замену всех вхождений и перезапись файла не посчитать - это «±».
 */
const callCounts = (tool: ToolFeedItem, undiffed: boolean): Counts => {
  const { name, input } = tool

  if (undiffed && name !== 'Edit') return UNCOUNTED

  if (name === 'Write') {
    const created = CREATED_TEXT.test((tool.result?.text ?? '').trim())

    return { added: lineCount(text(input, 'content')), removed: 0, created, counted: true }
  }

  if (name === 'NotebookEdit') {
    const added = input['edit_mode'] === 'delete' ? 0 : lineCount(text(input, 'new_source'))

    return { added, removed: 0, created: false, counted: true }
  }

  const edits = input['edits']
  const pairs = name === 'MultiEdit' && Array.isArray(edits) ? edits.filter(isRecord) : [input]

  const counts = pairs.map(pairCounts).reduce((sum, pair) => ({
    added: sum.added + pair.added,
    removed: sum.removed + pair.removed,
    created: false,
    counted: sum.counted && pair.counted,
  }))

  // Большая правка что-то поменяла точно: ноль по вызову - не «ничего», а «не посчитать».
  return undiffed && counts.added + counts.removed === 0 ? UNCOUNTED : counts
}

/**
 * Строки одной правки - по диффу CLI, а не по вызову: replace_all меняет текст столько
 * раз, сколько он встречается, а Write поверх файла удаляет строки, которых вызов не
 * называет. Созданный файл - по аргументу вызова: весь он и добавлен. Большую правку CLI
 * присылает с пустым диффом - она остаётся в списке (без цифр, пока сверка в конце хода
 * не посчитает её по копии), а не выпадает из него.
 *
 * ledger - точные правки главного процесса по id вызова: с ним запись того же текста не
 * даёт строки, а кнопка отката есть, только если правка там есть.
 */
const changeOf = (
  tool: ToolFeedItem,
  ledger: ReadonlyMap<string, EditEntry> | undefined,
): ToolChange | null => {
  const field = EDIT_TOOL_PATH_FIELD[tool.name]
  const inputPath = field ? text(tool.input, field) : ''
  const { result } = tool

  if (!inputPath || tool.status !== 'done' || !result || result.isError) return null

  const entry = ledger?.get(tool.id)
  const path = entry?.path ?? inputPath
  const exact = !ledger || typeof entry?.edit === 'object'

  if (result.created) {
    const added = lineCount(text(tool.input, 'content'))

    return { path, added, removed: 0, created: true, counted: true, undoable: exact }
  }

  if (entry?.edit === 'unchanged') return null

  const counts = result.changeCounts

  if (counts && counts.added + counts.removed > 0) {
    return { path, ...counts, created: false, counted: true, undoable: exact }
  }

  return { path, ...callCounts(tool, counts !== undefined), undoable: false }
}

/** Вторая правка того же файла - в его строку: сумма, созданный остаётся созданным. */
const merged = (known: ToolChange, change: ToolChange): ToolChange => ({
  ...known,
  added: known.added + change.added,
  removed: known.removed + change.removed,
  created: known.created || change.created,
  counted: known.counted && change.counted,
  undoable: known.undoable && change.undoable,
})

/**
 * Файлы, которые поменял ход: все правки с начала хода, и субагентов тоже. Файл,
 * тронутый дважды, - одна строка с суммой. Правка, которая ничего не изменила, строки
 * не даёт.
 */
export const turnChanges = (
  items: readonly FeedItem[],
  ledger?: ReadonlyMap<string, EditEntry>,
): FileChange[] => {
  const byPath = new Map<string, ToolChange>()

  for (const item of items) {
    const change = item.kind === 'tool' ? changeOf(item, ledger) : null

    if (!change) continue

    const known = byPath.get(change.path)

    byPath.set(change.path, known ? merged(known, change) : change)
  }

  return [...byPath.values()]
    .filter((change) => change.created || !change.counted || change.added + change.removed > 0)
    .map((change) => ({ ...change, reverted: false, refusal: null }))
}

/**
 * Вызовы хода, закрытого итогом turnId: от итога назад до прошлого итога или сообщения
 * человека, начавшего ход (написанное посреди хода его не начинает).
 */
export const turnTools = (items: readonly FeedItem[], turnId: string): ToolFeedItem[] => {
  const tools: ToolFeedItem[] = []

  for (let index = items.findIndex((item) => item.id === turnId) - 1; index >= 0; index -= 1) {
    const item = items[index]

    if (!item || item.kind === 'turn' || (item.kind === 'user' && !item.steering)) break
    if (item.kind === 'tool') tools.push(item)
  }

  return tools.reverse()
}
