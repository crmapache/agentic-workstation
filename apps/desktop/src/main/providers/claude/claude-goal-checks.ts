import { join } from 'node:path'

import { MINUTE_MS } from '@shared/time-units'

import type { ClaudeService } from '../../claude/claude-service'
import { askStructured } from '../../claude/structured-ask'
import type { AskResult, AskRequest } from '../../claude/structured-ask'
import type { ConnectorsService } from '../../connectors/connectors-service'
import { lookPrompt, judgePrompt, LOOK_SCHEMA, JUDGE_SCHEMA } from '../../goals/goal-briefing'
import type { GoalChecker } from '../../goals/goal-watch'

/** Дешёвая модель проверок: суждение «событие или шум» умному не нужно. */
const CHECK_MODEL = 'haiku'
const CHECK_EFFORT = 'low'

/** Вопрос - секунды; взгляд с веб-поиском - дольше, но не бесконечно. */
const JUDGE_MS = 2 * MINUTE_MS
const LOOK_MS = 5 * MINUTE_MS

/** Веб для взгляда: страница сайта, поиск. Браузер человека - нет: он не для фона. */
const LOOK_WEB = ['WebFetch', 'WebSearch']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const words = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/**
 * Проверки поручений на Claude Code (ADR 0080): разовый `claude -p` на Haiku с низким
 * усилием, ответ по схеме, в своей пустой папке, на аккаунте панели. Судья видит только два
 * ответа сторожа и инструментов не имеет; взгляд получает веб и инструменты чтения проекта
 * через шлюз - поимённо, всё прочее ему отказано.
 */
export const claudeGoalChecks = (
  claude: ClaudeService,
  connectors: ConnectorsService,
  dataDir: string,
  /** Модель из Settings → AI; пусто - Haiku. */
  model: () => string = () => '',
): GoalChecker => {
  const ask = async (
    request: Omit<AskRequest, 'model' | 'effort' | 'cwd' | 'signal'>,
    signal: AbortSignal,
  ): Promise<AskResult> => {
    const cli = await claude.cli.locate()

    if (!cli) return { failure: 'cli-missing', detail: 'Claude Code is not found.', costUsd: 0 }

    return askStructured(
      { ...cli, env: claude.accounts.envFor(cli.env) },
      {
        ...request,
        model: model() || CHECK_MODEL,
        effort: CHECK_EFFORT,
        cwd: join(dataDir, 'goal-checks'),
        signal: AbortSignal.any([signal, AbortSignal.timeout(request.timeoutMs)]),
      },
    )
  }

  return {
    judge: async (input, signal) => {
      const result = await ask(
        { prompt: judgePrompt(input), schema: JUDGE_SCHEMA, tools: [], timeoutMs: JUDGE_MS },
        signal,
      )

      if (!('output' in result) || !isRecord(result.output)) {
        return {
          error: 'detail' in result ? result.detail || result.failure : 'no answer',
          costUsd: result.costUsd,
        }
      }

      return {
        relevant: result.output['relevant'] === true,
        summary: words(result.output['summary']),
        costUsd: result.costUsd,
      }
    },
    look: async (input, signal) => {
      const launch = await connectors.mcpConfigFor(input.projectPath).catch(() => null)

      // Свой разговор у проверки: коннекторы ключуют своё по разговору, а не по процессу.
      launch?.own({ conversationId: `goal-look-${Date.now()}`, workDir: input.projectPath })

      try {
        const result = await ask(
          {
            prompt: lookPrompt(input),
            schema: LOOK_SCHEMA,
            tools: LOOK_WEB,
            timeoutMs: LOOK_MS,
            ...(launch
              ? { mcpConfig: launch.path, mcpTools: connectors.goals.readTools(input.projectPath) }
              : {}),
          },
          signal,
        )

        if (!('output' in result) || !isRecord(result.output)) {
          return {
            error: 'detail' in result ? result.detail || result.failure : 'no answer',
            costUsd: result.costUsd,
          }
        }

        return {
          changed: result.output['changed'] === true,
          seen: words(result.output['seen']),
          summary: words(result.output['summary']),
          costUsd: result.costUsd,
        }
      } finally {
        launch?.release()
      }
    },
  }
}
