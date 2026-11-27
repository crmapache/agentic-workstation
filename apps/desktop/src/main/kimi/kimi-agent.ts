import { join } from 'node:path'

import type { EffortLevel, PermissionMode } from '@shared/conversation'

import type { AcpAgent } from '../acp/acp-agent'
import { sharedBriefing } from '../acp/acp-briefing'
import { acpCli } from '../acp/acp-locator'
import { withLocalTime } from '../agents/conversation/local-time-briefing'
import { writeKimiProfile } from './kimi-profile'
import { kimiLens } from './kimi-tools'

/** Порог версии: 0.x - другой протокол и формат журнала (Python и ранний TypeScript), ADR 0092. */
const MINIMUM = '2.0.0'

const BRIEFING = sharedBriefing('Kimi Code')

/**
 * Режимы IDE → режимы Kimi (по коду Kimi 2.7, документация путает): `yolo` - обычное без
 * вопросов, опасные команды спрашивает (наш «auto»); `auto` Kimi - не спрашивает ничего (наш
 * «без вопросов»).
 */
const MODES: Partial<Record<PermissionMode, string>> = {
  default: 'default',
  auto: 'yolo',
  plan: 'plan',
  bypassPermissions: 'auto',
}

/** Уровни размышления Kimi ↔ уровни IDE: «off» - наш minimal, «on» (без уровней) - high. */
const EFFORTS: Record<string, EffortLevel> = {
  off: 'minimal',
  on: 'high',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
}

/**
 * Kimi Code (`kimi acp`, ADR 0092): своя папка IDE (`KIMI_CODE_HOME`) - свой вход, свои
 * разговоры и никаких MCP человека из его `mcp.json`. Подмену клиента
 * (`KIMI_CODE_IDENTITY_SLUG`) не трогаем никогда (условия Kimi, ADR 0094). root - папка панели в
 * userData.
 */
export const kimiAgent = (root: string): AcpAgent => {
  const home = join(root, 'home')

  return {
    provider: 'kimi',
    tag: 'kimi',
    // Установщик Kimi: ~/.kimi-code/bin (Windows - %USERPROFILE%\.kimi-code\bin\kimi.exe);
    // Homebrew, npm и winget - через PATH и общие папки поиска. На Windows Kimi без Git Bash не
    // открывает сессию - KIMI_SHELL_PATH называет свой bash.exe.
    ...acpCli({
      name: 'kimi',
      macDirs: ['.kimi-code/bin'],
      windowsDirs: [['USERPROFILE', '.kimi-code\\bin']],
      minimum: MINIMUM,
      gitBash: { variable: 'KIMI_SHELL_PATH' },
    }),
    launch: () => ({ args: ['acp'], env: { KIMI_CODE_HOME: home } }),
    // Вход по коду устройства: Kimi сам открывает страницу, печатает адрес и код и ждёт.
    login: () => ({
      args: ['login'],
      env: { KIMI_CODE_HOME: home },
      needsCode: false,
      urlPattern: /https:\/\/\S*kimi\.\S*\/authorize_device\S*/,
    }),
    modes: ['default', 'auto', 'plan', 'bypassPermissions'],
    modeOf: (mode) => MODES[mode] ?? 'default',
    modeFrom: (agentMode) =>
      (Object.entries(MODES).find(([, value]) => value === agentMode)?.[0] as
        PermissionMode | undefined) ?? null,
    effortOf: (effort, option) => {
      const values = (option.options ?? []).map((one) => one.value)
      const exact = values.find((value) => value === effort)
      const named = Object.entries(EFFORTS).find(
        ([value, level]) => level === effort && values.includes(value),
      )?.[0]

      return exact ?? named ?? null
    },
    effortsOf: (option) =>
      [
        ...new Set(
          (option.options ?? []).flatMap((one) => (EFFORTS[one.value] ? [EFFORTS[one.value]] : [])),
        ),
      ] as EffortLevel[],
    lens: () => kimiLens,
    // Номер до двоеточия у Kimi в живом потоке и при повторе разный (`1:call_x`, `2:call_x`).
    toolId: (id) => id.slice(id.indexOf(':') + 1),
    briefing: BRIEFING,
    instructions: null,
    // Папку делят панель и исполнитель сценариев: указания - общие для обоих (acp-briefing.ts).
    // Пояс человека - на запуск IDE: профиль пишется раз, сессий у него много.
    prepare: () => writeKimiProfile(home, withLocalTime(BRIEFING)),
  }
}
