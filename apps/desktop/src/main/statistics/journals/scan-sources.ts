import { homedir } from 'node:os'
import { join } from 'node:path'

import type { ScanSource } from './journal-format'

/**
 * Откуда читать журналы провайдеров. Окружение - то, с которым запускаются сами CLI (login
 * shell): CODEX_HOME и XDG_DATA_HOME из профиля оболочки приложению из Finder не видны.
 *
 * - Claude Code - projects/ в его доме (его даёт вызывающий: claudeHome);
 * - Codex - общий CODEX_HOME: у добавленных аккаунтов IDE журналы - ссылки на него;
 * - OpenCode - база разговоров IDE (свои папки XDG в userData, opencode-service.ts) и база
 *   OpenCode самого человека, если он им пользуется вне IDE;
 * - Antigravity - папка данных `agy` у IDE (`<userData>/antigravity/gemini`) и у человека
 *   (`~/.gemini`), Kimi Code - KIMI_CODE_HOME IDE (`<userData>/kimi/home`) и человека
 *   (`~/.kimi-code`), ADR 0092.
 */
export const scanSourcesOf = (
  env: Readonly<Record<string, string | undefined>>,
  dataDir: string,
  claudeProjects: string,
): ScanSource[] => {
  const home = env['HOME'] || homedir()
  const dataHome = env['XDG_DATA_HOME'] || join(home, '.local', 'share')
  const databases = [
    join(dataDir, 'opencode', 'data', 'opencode', 'opencode.db'),
    join(dataHome, 'opencode', 'opencode.db'),
  ]

  return [
    { provider: 'claude', path: claudeProjects },
    { provider: 'codex', path: env['CODEX_HOME'] || join(home, '.codex') },
    ...[...new Set(databases)].map((path): ScanSource => ({ provider: 'opencode', path })),
    {
      provider: 'antigravity',
      path: join(dataDir, 'antigravity', 'gemini', 'antigravity-cli'),
    },
    { provider: 'antigravity', path: join(home, '.gemini', 'antigravity-cli') },
    { provider: 'kimi', path: join(dataDir, 'kimi', 'home') },
    { provider: 'kimi', path: env['KIMI_CODE_HOME'] || join(home, '.kimi-code') },
  ]
}
