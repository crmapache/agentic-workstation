import type { AgentDriver } from '../../agents/conversation/agent-parts'
import type { ClaudeHost } from './claude-conversation'
import { claudeOf, attachClaude } from './claude-conversation'
import { applyOptions } from './options'
import { openClaudeSession } from './spawn'

/**
 * Драйвер Claude Code для разговоров ядра (ADR 0083): лента из потока `claude -p`, сессия -
 * процесс CLI на выбранном аккаунте, настройки - управляющими запросами живому процессу.
 * host - сервис панели; он же держит драйвер, поэтому берётся при каждом вызове.
 */
export const claudeDriver = (host: () => ClaudeHost): AgentDriver => ({
  attach: (runtime) => {
    const claude = attachClaude(runtime, host())

    return { feed: claude.coreFeed(), shells: claude.shells }
  },

  open: async (runtime) => {
    const claude = claudeOf(runtime)
    const cli = await claude.host.cli()

    if (!cli) {
      runtime.update({ error: 'cli-not-found' })

      return null
    }

    const session = await openClaudeSession(runtime, cli)

    if (!session) return null

    claude.cli = cli
    claude.session = session
    claude.freshProcess = true
    claude.namedAs = null
    // Цена хода у CLI - накопленная за процесс: новый процесс считает с нуля.
    claude.feed.builder.startProcess()

    return session
  },

  setOptions: (runtime, options) => applyOptions(runtime, options),
})
