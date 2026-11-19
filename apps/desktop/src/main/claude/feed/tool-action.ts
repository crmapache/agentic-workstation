import { structuredPatch } from 'diff'

import type { PatchHunk, ToolInput, ToolAction } from '@shared/conversation-feed'

import { isRecord, stringField } from '../cli/cli-messages'

/** Сколько контекста вокруг правки, когда дифф по входу считаем сами. */
const CONTEXT_LINES = 2

/** Служебные вызовы: список задач рисует панель над полем, поиск инструментов - шум. */
const TODO_TOOLS = new Set([
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskGet',
  'TaskList',
  'ToolSearch',
])

/** Вызов MCP-инструмента: `mcp__сервер__инструмент`. */
const MCP_NAME = /^mcp__(.+?)__(.+)$/

const firstLine = (value: string) => value.split('\n')[0]?.trim() ?? ''

const countLines = (value: string) => {
  const trimmed = value.replace(/\n+$/, '')

  return trimmed ? trimmed.split('\n').length : 0
}

const hunksOf = (before: string, after: string): PatchHunk[] =>
  structuredPatch('', '', before, after, '', '', { context: CONTEXT_LINES }).hunks

const filePath = (input: ToolInput) =>
  stringField(input, 'file_path') || stringField(input, 'notebook_path')

/** Путь из входа незнакомого вызова: файл или папка - шапка покажет его от корня проекта. */
const anyPath = (input: ToolInput) => filePath(input) || stringField(input, 'path')

/** Цель вызова без пути (как в ACC): шаблон, адрес, запрос или первая строка описания. */
const looseTarget = (input: ToolInput) =>
  stringField(input, 'pattern') ||
  stringField(input, 'url') ||
  stringField(input, 'query') ||
  firstLine(stringField(input, 'description') || stringField(input, 'prompt'))

/** Дифф правки по входу: заменяемые куски без номеров строк файла. */
const editPreview = (name: string, input: ToolInput): PatchHunk[] => {
  if (name === 'Edit') {
    return hunksOf(stringField(input, 'old_string'), stringField(input, 'new_string'))
  }

  const edits = input['edits']

  if (name !== 'MultiEdit' || !Array.isArray(edits)) return []

  return edits.flatMap((edit: unknown) =>
    isRecord(edit) ? hunksOf(stringField(edit, 'old_string'), stringField(edit, 'new_string')) : [],
  )
}

/** Тексты вопросов из входа AskUserQuestion. */
const questionTitles = (input: ToolInput): string[] => {
  const questions = input['questions']

  if (!Array.isArray(questions)) return []

  return questions
    .map((question: unknown) => (isRecord(question) ? stringField(question, 'question') : ''))
    .filter(Boolean)
}

const readAction = (input: ToolInput): ToolAction => {
  const offset = input['offset']

  return {
    kind: 'read',
    path: filePath(input),
    line: typeof offset === 'number' && offset > 0 ? offset : null,
  }
}

const writeAction = (input: ToolInput): ToolAction => {
  const content = stringField(input, 'content')

  return {
    kind: 'write',
    path: filePath(input),
    preview: hunksOf('', content),
    lines: countLines(content),
  }
}

const agentAction = (name: string, input: ToolInput): ToolAction => ({
  kind: 'agent',
  agent: stringField(input, 'subagent_type'),
  description: stringField(input, 'description'),
  prompt: stringField(input, 'prompt'),
  workflow: name === 'Workflow',
})

/** Свои инструменты Claude Code по имени; MCP и незнакомые - отдельно. */
const knownAction = (name: string, input: ToolInput): ToolAction | null => {
  switch (name) {
    case 'Read':
    case 'NotebookRead':
      return readAction(input)
    case 'Grep':
    case 'Glob':
    case 'LS':
      return {
        kind: 'search',
        pattern: stringField(input, 'pattern'),
        path: stringField(input, 'path'),
      }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { kind: 'edit', path: filePath(input), preview: editPreview(name, input) }
    case 'Write':
      return writeAction(input)
    case 'Bash':
    case 'BashOutput':
    case 'KillShell':
      return {
        kind: 'command',
        command: stringField(input, 'command'),
        description: stringField(input, 'description'),
      }
    case 'WebFetch':
      return { kind: 'web', target: stringField(input, 'url') }
    case 'WebSearch':
      return { kind: 'web', target: stringField(input, 'query') }
    case 'Skill':
      return {
        kind: 'skill',
        skill: stringField(input, 'skill'),
        args: firstLine(stringField(input, 'args')),
      }
    case 'Task':
    case 'Agent':
    case 'Workflow':
      return agentAction(name, input)
    case 'ExitPlanMode':
      return { kind: 'plan', plan: stringField(input, 'plan') }
    case 'AskUserQuestion':
      return { kind: 'question', questions: questionTitles(input) }
    default:
      return null
  }
}

/**
 * Вызов инструмента Claude Code общими словами (ADR 0083): по имени и входу - что он делает.
 * Вход вызова растёт, пока идёт поток, - вид считается заново на каждый новый вход.
 */
export const claudeToolAction = (name: string, input: ToolInput): ToolAction => {
  const known = knownAction(name, input)

  if (known) return known
  if (TODO_TOOLS.has(name)) return { kind: 'todo' }

  const mcp = MCP_NAME.exec(name)

  if (mcp?.[1] && mcp[2]) {
    return {
      kind: 'mcp',
      server: mcp[1],
      tool: mcp[2],
      target: looseTarget(input),
      path: anyPath(input),
    }
  }

  return { kind: 'other', target: looseTarget(input), path: anyPath(input) }
}
