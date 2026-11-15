import { join } from 'node:path'

import { broadcast } from '../ipc/broadcast'
import { loginShell, spawnNodePty } from './node-pty-spawn'
import { terminalEnv } from './terminal-env'
import { TerminalService } from './terminal-service'
import { withZshIntegration } from './zsh-integration'
import { ZSH_INTEGRATION_DIR } from './zsh-integration.constants'

/**
 * Терминалы под панелью Claude Code (ADR 0037): оболочка в корне проекта, вывод и список
 * вкладок - окну, обёртка zsh - в userData. Закрытый проект гасит свои (index.ts).
 */
export const createTerminalService = (userData: string, version: string): TerminalService =>
  new TerminalService(
    {
      output: (output) => broadcast('terminal:output', output),
      sessions: (sessions) => broadcast('terminal:sessions', sessions),
    },
    {
      spawn: spawnNodePty,
      shell: loginShell,
      env: withZshIntegration(join(userData, ZSH_INTEGRATION_DIR), () =>
        terminalEnv(process.env, version),
      ),
    },
  )
