import { join } from 'node:path'

import type { ProviderId } from '@shared/providers'
import type { ServiceAi } from '@shared/service-ai'
import { MINUTE_MS } from '@shared/time-units'

import { lookPrompt, judgePrompt, LOOK_SCHEMA, JUDGE_SCHEMA } from '../goals/goal-briefing'
import type { GoalChecker } from '../goals/goal-watch'
import type { AuthorAnswer, TaskAuthorHost } from '../tasks/task-author'
import type { ScenarioProvider } from './scenario-provider'
import type { AskOnce, AskOnceResult } from './run-stream/ask-once'

/** Проверки - секунды; взгляд с вебом и коннекторами - дольше, но не бесконечно. */
const JUDGE_MS = 2 * MINUTE_MS
const LOOK_MS = 5 * MINUTE_MS
/** Черновик задания - один ответ модели: дольше трёх минут ждать незачем. */
const AUTHOR_MS = 3 * MINUTE_MS

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const words = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Что служебной работе нужно от IDE: настройка Settings → AI и исполнители провайдеров. */
export type ServiceWorkHost = {
  setting: () => ServiceAi
  runner: (id: ProviderId) => ScenarioProvider | null
  dataDir: string
}

/**
 * Разовый вопрос провайдера служебной работы, если это не Claude Code (у него свой путь,
 * structured-ask.ts); null - спрашивать Claude Code.
 */
export const serviceAsk = (host: ServiceWorkHost) => {
  const { provider } = host.setting()
  const ask = provider === 'claude' ? undefined : host.runner(provider)?.askOnce

  return ask ?? null
}

/** Отказ вопроса - словами для истории сторожа. */
const failed = (answer: AskOnceResult) => ({
  error: 'error' in answer ? answer.error : 'no answer',
  costUsd: 0,
})

/**
 * Проверки поручений (ADR 0080) у провайдера из Settings → AI: судья - без инструментов, взгляд
 * - с вебом и инструментами чтения коннекторов проекта поимённо. Claude Code - прежним путём
 * (claude-goal-checks.ts) с моделью из настройки. Цены разового вопроса Codex и OpenCode не
 * называют - проверка стоит ноль в бюджете поручения.
 */
export const serviceGoalChecks = (
  host: ServiceWorkHost,
  claude: GoalChecker,
  readTools: (projectPath: string) => string[],
): GoalChecker => {
  const base = (signal: AbortSignal): Pick<AskOnce, 'model' | 'effort' | 'cwd' | 'signal'> => ({
    model: host.setting().model,
    effort: 'low',
    cwd: join(host.dataDir, 'goal-checks'),
    signal,
  })

  return {
    judge: async (input, signal) => {
      const ask = serviceAsk(host)

      if (!ask) return claude.judge(input, signal)

      const answer = await ask({
        ...base(signal),
        prompt: judgePrompt(input),
        schema: JUDGE_SCHEMA,
        timeoutMs: JUDGE_MS,
      })

      return 'output' in answer && isRecord(answer.output)
        ? {
            relevant: answer.output['relevant'] === true,
            summary: words(answer.output['summary']),
            costUsd: 0,
          }
        : failed(answer)
    },
    look: async (input, signal) => {
      const ask = serviceAsk(host)

      if (!ask) return claude.look(input, signal)

      const answer = await ask({
        ...base(signal),
        prompt: lookPrompt(input),
        schema: LOOK_SCHEMA,
        timeoutMs: LOOK_MS,
        tools: {
          web: true,
          mcp: { projectPath: input.projectPath, tools: readTools(input.projectPath) },
        },
      })

      return 'output' in answer && isRecord(answer.output)
        ? {
            changed: answer.output['changed'] === true,
            seen: words(answer.output['seen']),
            summary: words(answer.output['summary']),
            costUsd: 0,
          }
        : failed(answer)
    },
  }
}

/** Вопрос автора заданий у провайдера служебной работы (не Claude Code); null - у Claude Code. */
export const serviceAuthorAsk = (host: ServiceWorkHost): TaskAuthorHost['ask'] | null => {
  const ask = serviceAsk(host)

  if (!ask) return null

  return async (prompt, schema, signal): Promise<AuthorAnswer> => {
    const timeout = AbortSignal.timeout(AUTHOR_MS)
    const answer = await ask({
      prompt,
      schema: schema as Record<string, unknown>,
      model: host.setting().model,
      effort: 'medium',
      cwd: join(host.dataDir, 'task-author'),
      timeoutMs: AUTHOR_MS,
      signal: AbortSignal.any([signal, timeout]),
    })

    if ('output' in answer && answer.output !== null) return { output: answer.output }
    if (signal.aborted) return { failure: 'cancelled', detail: '' }
    if (timeout.aborted) return { failure: 'timeout', detail: '' }

    return {
      failure: 'failed',
      detail: 'error' in answer ? answer.error : 'The answer is not JSON.',
    }
  }
}
