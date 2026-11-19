import { rm, appendFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { EffortLevel, PermissionMode } from '@shared/conversation'

import type { AcpAgent } from '../acp/acp-agent'
import { panelBriefing } from '../acp/acp-briefing'
import { acpCli } from '../acp/acp-locator'
import type { AcpToolLens } from '../acp/feed/acp-feed-builder'
import { ANTIGRAVITY_PLACES } from '../statistics/antigravity/antigravity-journal'
import { antigravityLens } from './antigravity-tools'

/**
 * Порог версии: в 1.5.10 починены сессии ACP и есть режим `auto` (ADR 0092). Замерено на 1.5.12.
 */
const MINIMUM = '1.5.10'

/** id разговора `agy` - UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Режимы IDE → режимы ACP `agy`; «без вопросов» - флаг запуска, режим ACP при нём обычный. */
const MODES: Record<PermissionMode, string> = {
  default: 'default',
  acceptEdits: 'accept-edits',
  auto: 'auto',
  plan: 'plan',
  bypassPermissions: 'default',
  readOnly: 'default',
}

/** Уровни размышления `agy` ↔ уровни IDE (Extra - наш xhigh). */
const EFFORTS: Record<string, EffortLevel> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  extra: 'xhigh',
  max: 'max',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Google Antigravity (`agy acp`, ADR 0092, 0094): своя папка IDE (`--gemini-dir`) - свои
 * разговоры и никаких MCP и плагинов человека; вход Google общий с `agy` в терминале (Keychain).
 * root - папка панели в userData.
 */
export const antigravityAgent = (root: string): AcpAgent => {
  const geminiDir = join(root, 'gemini')

  return {
    provider: 'antigravity',
    tag: 'antigravity',
    // Установщик Google: мак - ~/.local/bin/agy, Windows - %LOCALAPPDATA%\agy\bin\agy.exe.
    ...acpCli({
      name: 'agy',
      macDirs: ['.local/bin'],
      windowsDirs: [['LOCALAPPDATA', 'agy\\bin']],
      minimum: MINIMUM,
    }),
    launch: (mode) => ({
      args: [
        'acp',
        '--gemini-dir',
        geminiDir,
        ...(mode === 'bypassPermissions' ? ['--dangerously-skip-permissions'] : []),
      ],
      env: {},
    }),
    modes: ['default', 'acceptEdits', 'auto', 'plan', 'bypassPermissions'],
    modeOf: (mode) => MODES[mode],
    modeFrom: (agentMode) =>
      (Object.entries(MODES).find(
        ([mode, value]) =>
          value === agentMode && mode !== 'bypassPermissions' && mode !== 'readOnly',
      )?.[0] as PermissionMode | undefined) ?? null,
    effortOf: (effort, option) => {
      const value = Object.entries(EFFORTS).find(([, level]) => level === effort)?.[0] ?? null

      return value && option.options?.some((one) => one.value === value) ? value : null
    },
    effortsOf: (option) =>
      (option.options ?? []).flatMap((one) =>
        EFFORTS[one.value] ? [EFFORTS[one.value]] : [],
      ) as EffortLevel[],
    lens: (servers): AcpToolLens => antigravityLens(servers),
    toolId: (id) => id,
    briefing: panelBriefing('Antigravity'),
    // Замерено на 1.5.12: `agy` объявляет `_meta.antigravity.systemPrompt.append` и дописывает
    // текст к своему промпту. Заменять промпт нельзя (условия Google, ADR 0094) - только дописать.
    instructions: (text) => ({ _meta: { antigravity: { systemPrompt: { append: text } } } }),
    // Вход Google - сам `agy`: печатает адрес и ждёт код со страницы входа в stdin.
    login: () => ({
      args: ['acp', '--login', '--gemini-dir', geminiDir],
      env: {},
      needsCode: true,
      urlPattern: /https:\/\/accounts\.google\.com\/\S+/,
    }),
    planOf: (setup) => {
      const meta = isRecord(setup._meta) ? setup._meta['antigravity'] : null
      const tier = isRecord(meta) ? meta['tier'] : null

      if (!isRecord(tier) || typeof tier['name'] !== 'string') return null

      return {
        plan: tier['name'],
        upgradeUrl: typeof tier['upgradeUri'] === 'string' ? tier['upgradeUri'] : '',
      }
    },
    // Папка разговора для статистики: в журнале `agy` её нет (statistics/antigravity).
    notePlace: (sessionId, cwd) =>
      appendFile(
        join(geminiDir, ANTIGRAVITY_PLACES),
        `${JSON.stringify({ sessionId, cwd })}\n`,
      ).catch(() => undefined),
    // Удалить разговор `agy` по ACP не умеет: пробная сессия каталога - файлами своей папки.
    forget: async (sessionId) => {
      const data = join(geminiDir, 'antigravity-cli')

      // id пришёл от процесса агента: удалять только по id вида UUID, иначе «..» снёс бы папку.
      if (!UUID.test(sessionId)) {
        console.warn('[antigravity] пробная сессия с непохожим id не удалена:', sessionId)

        return
      }

      await Promise.all([
        ...['', '-shm', '-wal'].map((suffix) =>
          rm(join(data, 'conversations', `${sessionId}.db${suffix}`), { force: true }),
        ),
        rm(join(data, 'brain', sessionId), { recursive: true, force: true }),
      ])
    },
  }
}
