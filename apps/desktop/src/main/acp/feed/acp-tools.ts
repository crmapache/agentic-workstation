import type { PatchHunk, ToolAction, ToolResult } from '@shared/conversation-feed'

import type { AcpToolCall, AcpToolContent } from '../protocol/acp-types'
import { lineDiff } from '../../agents/changes/line-diff'
import { hunkCounts } from '../../agents/feed/unified-diff'

/**
 * Вызов ACP в ленте (ADR 0092): `kind` по схеме - вид действия, драйвер агента уточняет его
 * своими полями (имя инструмента, MCP, артефакт). Здесь - общее для любого агента.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, ...keys: string[]): string => {
  for (const key of keys) {
    const value = record[key]

    if (typeof value === 'string' && value) return value
  }

  return ''
}

/** Вход вызова: `rawInput` объектом; у Kimi первый кусок приходит JSON-строкой в содержимом. */
export const inputOf = (call: AcpToolCall): Record<string, unknown> => {
  if (isRecord(call.rawInput)) return call.rawInput

  const first = call.content?.find((one) => one.type === 'content')

  if (first?.type === 'content' && first.content.type === 'text') {
    try {
      const parsed: unknown = JSON.parse(first.content.text)

      if (isRecord(parsed)) return parsed
    } catch {
      return {}
    }
  }

  return {}
}

/** Последний дифф файла в содержимом: у `agy` в вопросе - кусок, в конце вызова - файл целиком. */
export const diffOf = (call: AcpToolCall): Extract<AcpToolContent, { type: 'diff' }> | null =>
  call.content?.findLast((one) => one.type === 'diff') ?? null

/** Ханки ленты по двум текстам: строки с префиксом и их счёт, как у диффа CLI. */
export const hunksOf = (before: string, after: string): PatchHunk[] =>
  (lineDiff(before, after) ?? []).map((hunk) => ({
    oldStart: hunk.oldStart,
    newStart: hunk.newStart,
    oldLines: hunk.lines.filter((line) => line.startsWith('-') || line.startsWith(' ')).length,
    newLines: hunk.lines.filter((line) => line.startsWith('+') || line.startsWith(' ')).length,
    lines: hunk.lines,
  }))

/** Путь вызова: из `locations`, иначе из входа. */
const pathOf = (call: AcpToolCall, input: Record<string, unknown>): string =>
  call.locations?.[0]?.path ?? text(input, 'path', 'Path', 'file_path', 'AbsolutePath')

/**
 * Вид действия по общим полям ACP. Правка с диффом - карточкой правки (новый файл - запись),
 * команда - текстом команды, чтение и поиск - путём и шаблоном. Чего ACP не говорит (MCP,
 * вопрос, план), уточняет драйвер агента.
 */
export const acpToolAction = (call: AcpToolCall): ToolAction => {
  const input = inputOf(call)
  const path = pathOf(call, input)
  const title = call.title ?? ''

  switch (call.kind) {
    case 'read':
      return { kind: 'read', path, line: null }
    case 'search':
      return {
        kind: 'search',
        pattern: text(input, 'pattern', 'query', 'Query', 'SearchPath') || title,
        path,
      }
    case 'execute':
      return {
        kind: 'command',
        command: text(input, 'command', 'CommandLine', 'cmd') || title,
        description: text(input, 'description', 'toolSummary'),
      }
    case 'fetch':
      return { kind: 'web', target: text(input, 'url', 'Url', 'query') || title }
    case 'edit': {
      const diff = diffOf(call)
      const created = diff !== null && !diff.oldText
      const preview = diff ? hunksOf(diff.oldText ?? '', diff.newText) : []

      return created
        ? { kind: 'write', path: diff.path || path, preview, lines: 0 }
        : { kind: 'edit', path: diff?.path || path, preview }
    }
    case 'switch_mode':
      return { kind: 'plan', plan: text(input, 'plan') }
    default:
      return { kind: 'other', target: title, path }
  }
}

/** Текст результата: блоки содержимого и `rawOutput` (у `agy` вывод команды - в `output`). */
const outputOf = (call: AcpToolCall): string => {
  const blocks = (call.content ?? [])
    .map((one) => (one.type === 'content' && one.content.type === 'text' ? one.content.text : ''))
    .filter(Boolean)

  if (blocks.length > 0) return blocks.join('\n')
  if (typeof call.rawOutput === 'string') return call.rawOutput
  if (isRecord(call.rawOutput)) return text(call.rawOutput, 'output', 'content', 'text')

  return ''
}

/** Потолок текста результата в ленте: длинный вывод режется, как у других провайдеров. */
const RESULT_CHARS = 20_000

/** Итог вызова: текст, ошибка, у правки - дифф и счёт строк. */
export const acpToolResult = (call: AcpToolCall, failed: boolean): ToolResult => {
  const full = outputOf(call)
  const diff = call.kind === 'edit' ? diffOf(call) : null
  const patch = diff ? hunksOf(diff.oldText ?? '', diff.newText) : undefined

  return {
    text: full.slice(0, RESULT_CHARS),
    isError: failed,
    truncated: full.length > RESULT_CHARS,
    ...(patch && { patch, changeCounts: hunkCounts(patch), created: !diff?.oldText }),
  }
}

/** Слить обновление вызова с известным: поля, которых нет в обновлении, остаются прежними. */
export const mergeToolCall = (known: AcpToolCall | undefined, update: AcpToolCall): AcpToolCall => {
  const merged: AcpToolCall = { ...known, ...update }

  for (const [key, value] of Object.entries(update)) {
    if (value === undefined || value === null) merged[key] = known?.[key]
  }

  // Дифф правки приходит раньше итога (Kimi: дифф - в «in_progress», итог - текстом): итог
  // без диффа его не стирает.
  const knownDiffs = known?.content?.filter((one) => one.type === 'diff') ?? []

  if (
    update.content &&
    knownDiffs.length > 0 &&
    !update.content.some((one) => one.type === 'diff')
  ) {
    merged.content = [...knownDiffs, ...update.content]
  }

  return merged
}
