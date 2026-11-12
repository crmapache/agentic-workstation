import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { EFFORT_LEVELS } from '@shared/claude'
import { MODEL_NAME_PATTERN } from '@shared/claude-prefs'

import { cliPermissionMode } from '../claude/cli/cli-args'
import type { CliFeatures } from '../claude/cli/cli-features'
import type { SessionSpec } from './engine/scenario-session'

/** Режимы, которые сценарий может дать карточке; manual - старое имя «спрашивать». */
const MODES = new Set(['acceptEdits', 'plan', 'bypassPermissions', 'auto'])

/**
 * Аргументы процесса головы или карточки: поток JSON в обе стороны, вопросы разрешения
 * управляющими запросами (без `--permission-prompt-tool stdio` CLI молча отказывает во всём,
 * что требует разрешения), брифинг одной строкой. Модель и усилие из файла сценария - только
 * если похожи на имя: аргумент с переводом строки или кавычкой резал бы команду. Слои
 * настроек - все, как у панели: процесс поднимается без `--setting-sources`.
 */
export const scenarioArgs = (spec: SessionSpec, features: CliFeatures): string[] => {
  const mode = MODES.has(spec.permissionMode)
    ? spec.permissionMode
    : cliPermissionMode('default', features)
  const model = MODEL_NAME_PATTERN.test(spec.model) && !spec.model.startsWith('-') ? spec.model : ''
  const effort = EFFORT_LEVELS.find((level) => level === spec.effort)

  return [
    '-p',
    '--verbose',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--permission-prompt-tool',
    'stdio',
    '--append-system-prompt',
    spec.briefing.replace(/[\n\r"]/g, ' '),
    ...(spec.resume ? ['--resume', spec.sessionId] : ['--session-id', spec.sessionId]),
    '--permission-mode',
    mode,
    ...(features.allowSkipPermissions ? ['--allow-dangerously-skip-permissions'] : []),
    ...(model ? ['--model', model] : []),
    ...(effort ? ['--effort', effort] : []),
    // MCP у сессий сценария - только коннекторы IDE, как у панели (ADR 0029): ключ запуска
    // шлюза выдан на исходный проект, а не на папку worktree.
    '--strict-mcp-config',
    ...(spec.mcpConfig ? ['--mcp-config', spec.mcpConfig] : []),
  ]
}

/** Файл транскрипта разговора в одной из папок проекта; null - CLI его ещё не записал. */
export const transcriptIn = (dirs: readonly string[], sessionId: string): string | null => {
  if (!/^[0-9a-f-]{8,64}$/i.test(sessionId)) return null

  for (const dir of dirs) {
    const file = join(dir, `${sessionId}.jsonl`)

    if (existsSync(file)) return file
  }

  return null
}
