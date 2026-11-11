import type { AskStructured } from '../connectors/ai-connector'
import type { ClaudeService } from './claude-service'
import { askStructured } from './structured-ask'

/** Потолок самого процесса: отмену по времени держит тот, кто спрашивает. */
const PROCESS_CEILING_MS = 11 * 60_000

/**
 * Разовый вопрос к Claude Code для коннекторов IDE (коннектор от ИИ): на аккаунте панели,
 * в своей пустой папке, из инструментов - только чтение сети. Модулю коннекторов Claude
 * Code не виден: он получает просто «спросить по схеме».
 */
export const claudeAsk =
  (claude: ClaudeService, cwd: string): AskStructured =>
  async (prompt, schema, signal) => {
    const cli = await claude.cli.locate()

    if (!cli) return { failure: 'cli-missing', detail: '' }

    return askStructured(
      { ...cli, env: claude.accounts.envFor(cli.env) },
      {
        prompt,
        schema,
        tools: ['WebFetch', 'WebSearch'],
        cwd,
        timeoutMs: PROCESS_CEILING_MS,
        signal,
      },
    )
  }
