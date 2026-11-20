import type { ProviderId } from '@shared/providers'

import type { ClaudeService } from '../claude/claude-service'
import { askStructured } from '../claude/structured-ask'
import type { ScenarioProvider } from './scenario-provider'
import type { AskOnce, AskOnceResult } from './run-stream/ask-once'

/** Разовый вопрос со схемой ответа: у Claude Code схема обязательна (`--json-schema`). */
export type AskProvider = (
  provider: ProviderId,
  ask: AskOnce & { schema: Record<string, unknown> },
) => Promise<AskOnceResult>

/**
 * Разовый вопрос любому провайдеру служебной работы: Claude Code - `claude -p` без инструментов
 * на аккаунте панели (её и оплачивает), прочие - askOnce своего исполнителя. Провайдер без
 * исполнителя (Antigravity, ADR 0094) или без CLI - отказ словами, а не исключение: спросивший
 * идёт к следующему.
 */
export const askProviderOf =
  (claude: ClaudeService, runners: ReadonlyMap<ProviderId, ScenarioProvider>): AskProvider =>
  async (provider, ask) => {
    if (provider !== 'claude') {
      const askOnce = runners.get(provider)?.askOnce

      return askOnce ? askOnce(ask) : { error: `${provider} does not answer outside its chat.` }
    }

    const cli = await claude.cli.locate()

    if (!cli) return { error: 'Claude Code is not found on this machine.' }

    const result = await askStructured(
      { ...cli, env: claude.accounts.envFor(cli.env) },
      {
        prompt: ask.prompt,
        schema: ask.schema,
        tools: [],
        ...(ask.model && { model: ask.model }),
        ...(ask.effort && { effort: ask.effort }),
        cwd: ask.cwd,
        timeoutMs: ask.timeoutMs,
        signal: ask.signal ?? AbortSignal.timeout(ask.timeoutMs),
      },
    )

    return 'output' in result
      ? { text: JSON.stringify(result.output), output: result.output }
      : { error: result.detail || result.failure }
  }
