import { join, isAbsolute } from 'node:path'

import { structuredPatch } from 'diff'

import type { PatchHunk, ToolInput, ToolAction, ToolResult } from '@shared/conversation-feed'

import { hunkCounts, hunksOfUnifiedDiff } from '../../agents/feed/unified-diff'
import { mcpCallAction, CODE_MODE_TOOL, codeModeAction } from './code-mode'

/**
 * Вызовы инструментов OpenCode (ADR 0084) - видом действия ленты. Имена и входы сняты с живого
 * OpenCode 2.3.2 (docs/plan-providers/40-open-models.md): `read` {path, offset, limit}, `edit`
 * {path, oldString, newString}, `write` {path, content}, `shell` {command, workdir}, `glob` и
 * `grep` {pattern, path}, `webfetch` {url}, `websearch` {query}, `subagent` {agent, description,
 * prompt}, `patch` {patchText} (правка в виде apply_patch - её получают модели GPT), `question`
 * {questions}, `todowrite`, `skill` {name}. Старые имена (`bash`, `task`, `apply_patch`) - те же
 * инструменты, как их сводит сам OpenCode. Вызов MCP - `<сервер>_<инструмент>` по именам
 * коннекторов, а в Code Mode - кодом в `execute` {code} (code-mode.ts, ADR 0088).
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

/** Старые имена инструментов OpenCode - нынешними, как сводит их он сам. */
const RENAMED: Readonly<Record<string, string>> = {
  bash: 'shell',
  task: 'subagent',
  apply_patch: 'patch',
}

/** Имя инструмента, как его понимает разбор: в нижнем регистре, старое - нынешним. */
export const openCodeToolName = (name: string): string => {
  const lower = name.toLowerCase()

  return RENAMED[lower] ?? lower
}

/** Файлы правки `patch` по её тексту: `*** Add|Update|Delete File: <путь>`. */
const PATCH_FILE = /^\*\*\* (Add|Update|Delete) File: (.+)$/gm

/** Сколько контекста вокруг правки, когда дифф по входу считаем сами. */
const CONTEXT_LINES = 2

const hunksOf = (before: string, after: string): PatchHunk[] =>
  structuredPatch('', '', before, after, '', '', { context: CONTEXT_LINES }).hunks

const countLines = (value: string) => {
  const trimmed = value.replace(/\n+$/, '')

  return trimmed ? trimmed.split('\n').length : 0
}

/**
 * Что вызову известно о процессе: имена серверов MCP коннекторов (по ним вызов MCP отличается
 * от прочих) и папка проекта - OpenCode пишет пути от неё, а лента держит полные, как у
 * Claude и Codex.
 */
export type ToolContext = { servers: readonly string[]; root: string }

const NO_CONTEXT: ToolContext = { servers: [], root: '' }

/** Путь полным: относительный - от папки проекта. */
const fullPath = (value: string, root: string) =>
  value && root && !isAbsolute(value) ? join(root, value) : value

/** Путь из входа - полным. */
const pathOf = (input: ToolInput, root: string) =>
  fullPath(text(input, 'path') || text(input, 'filePath'), root)

/**
 * Правка `patch` до итога - по первому файлу её текста: новый - запись, прочие - правка. Файлов
 * несколько - итог раскладывает их по своим строкам ленты (openCodePatchFiles).
 */
const patchAction = (input: ToolInput, root: string): ToolAction => {
  const [first] = text(input, 'patchText').matchAll(PATCH_FILE)
  const path = fullPath(first?.[2]?.trim() ?? '', root)

  if (!path) return { kind: 'other', target: '', path: '' }

  return first?.[1] === 'Add'
    ? { kind: 'write', path, preview: [], lines: 0 }
    : { kind: 'edit', path, preview: [] }
}

/** Сервер MCP вызова по имени `<сервер>_<инструмент>`: известные имена серверов - длинные первыми. */
const mcpOf = (name: string, servers: readonly string[]) => {
  const server = [...servers]
    .sort((left, right) => right.length - left.length)
    .find((candidate) => name.startsWith(`${candidate}_`))

  return server ? { server, tool: name.slice(server.length + 1) } : null
}

/** Вид действия вызова по имени и входу. */
export const openCodeToolAction = (
  name: string,
  input: ToolInput,
  context: ToolContext = NO_CONTEXT,
): ToolAction => {
  const mcp = mcpOf(name, context.servers)
  const path = (from: ToolInput) => pathOf(from, context.root)

  if (mcp) return mcpCallAction(mcp.server, mcp.tool, input)

  switch (openCodeToolName(name)) {
    case CODE_MODE_TOOL:
      return codeModeAction(input, null, context.servers)
    case 'read': {
      const offset = input['offset']

      return {
        kind: 'read',
        path: path(input),
        line: typeof offset === 'number' && offset > 1 ? offset : null,
      }
    }
    case 'edit':
      return {
        kind: 'edit',
        path: path(input),
        preview: hunksOf(text(input, 'oldString'), text(input, 'newString')),
      }
    case 'write': {
      const content = text(input, 'content')

      return {
        kind: 'write',
        path: path(input),
        preview: hunksOf('', content),
        lines: countLines(content),
      }
    }
    case 'patch':
      return patchAction(input, context.root)
    case 'shell':
      return {
        kind: 'command',
        command: text(input, 'command'),
        description: text(input, 'description'),
      }
    case 'glob':
    case 'grep':
    case 'list':
      return { kind: 'search', pattern: text(input, 'pattern'), path: path(input) }
    case 'webfetch':
      return { kind: 'web', target: text(input, 'url') }
    case 'websearch':
      return { kind: 'web', target: text(input, 'query') }
    case 'subagent':
      return {
        kind: 'agent',
        agent: text(input, 'agent') || text(input, 'subagent_type'),
        description: text(input, 'description'),
        prompt: text(input, 'prompt'),
        workflow: false,
      }
    case 'skill':
      return { kind: 'skill', skill: text(input, 'name'), args: '' }
    case 'question':
      return {
        kind: 'question',
        questions: (Array.isArray(input['questions']) ? input['questions'] : [])
          .filter(isRecord)
          .map((question) => text(question, 'question'))
          .filter(Boolean),
      }
    case 'todowrite':
    case 'todoread':
      return { kind: 'todo' }
    default:
      return {
        kind: 'other',
        target: text(input, 'pattern') || text(input, 'url') || text(input, 'query'),
        path: path(input),
      }
  }
}

/** Текст вывода из `content` ответа инструмента: текстовые части подряд. */
const contentText = (content: unknown): string =>
  (Array.isArray(content) ? content.filter(isRecord) : [])
    .filter((part) => part['type'] === 'text')
    .map((part) => text(part, 'text'))
    .join('\n')

/** Причина сбоя вызова: у OpenCode 2.3.2 - объект `{type, message}`, раньше - строка. */
const errorText = (error: unknown): string =>
  isRecord(error) ? text(error, 'message') : typeof error === 'string' ? error : ''

/** Файл правки из итога (`metadata.files[]`): полный путь, дифф кусками, новый ли. */
export type OpenCodeFileChange = { path: string; hunks: PatchHunk[]; created: boolean }

/** Файлы правки из итога вызова: `{file, patch, status}` по файлу, путь - полным. */
export const openCodeFileChanges = (
  data: Record<string, unknown>,
  root: string,
): OpenCodeFileChange[] => {
  const metadata = isRecord(data['metadata']) ? data['metadata'] : {}

  return (Array.isArray(metadata['files']) ? metadata['files'] : [])
    .filter(isRecord)
    .map((file) => ({
      path: fullPath(text(file, 'file') || text(file, 'relativePath'), root),
      hunks: hunksOfUnifiedDiff(text(file, 'patch')),
      created: file['status'] === 'added' || file['type'] === 'add',
    }))
}

/**
 * Итог вызова (`session.tool.success` / `failed`): текст вывода, у правки - дифф из
 * `metadata.files[].patch` со счётом строк, у команды - код выхода. files - файлы правки, если
 * строка ленты несёт только один из них (`patch` на несколько файлов).
 */
export const openCodeToolResult = (
  data: Record<string, unknown>,
  isError: boolean,
  files: readonly OpenCodeFileChange[] = openCodeFileChanges(data, ''),
): ToolResult => {
  const metadata = isRecord(data['metadata']) ? data['metadata'] : {}
  const patch = files.flatMap((file) => file.hunks)
  const exit = metadata['exit']
  const output = contentText(data['content']) || errorText(data['error']) || text(data, 'message')

  return {
    text: output,
    isError: isError || (typeof exit === 'number' && exit !== 0),
    truncated: metadata['truncated'] === true,
    ...(patch.length > 0 && { patch, changeCounts: hunkCounts(patch) }),
    ...(files.some((file) => file.created) && { created: true }),
  }
}
