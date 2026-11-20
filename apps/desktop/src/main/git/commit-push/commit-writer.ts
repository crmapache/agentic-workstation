import { join } from 'node:path'

import type { AiChoice } from '@shared/ide-prefs'
import type { ProviderId } from '@shared/providers'
import { MINUTE_MS } from '@shared/time-units'

import type { AskProvider } from '../../providers/ask-provider'
import { jsonOf } from '../../providers/run-stream/ask-once'
import type { CommitDiff } from './commit-diff'
import { commitPrompt, commitMessageOf, COMMIT_MESSAGE_SCHEMA } from './commit-prompt'

/** Один провайдер пишет сообщение не дольше двух минут: дальше - следующий в цепочке. */
const ASK_MS = 2 * MINUTE_MS

/**
 * Модель по умолчанию у работы: Claude Code пишет сообщение коммита на Haiku - быстро и
 * дёшево, а большего тема коммита не требует. У прочих - модель провайдера по умолчанию.
 */
const modelOf = (choice: AiChoice): string =>
  choice.model || (choice.provider === 'claude' ? 'haiku' : '')

export type CommitMessage = { message: string; by: ProviderId } | { refusals: string[] }

/**
 * Сообщение коммита по цепочке из Settings: не ответил провайдер (лимит, нет CLI, ошибка,
 * пустой ответ) - спрашивается следующий. Свои слова каждого отказа - для итога, если не
 * ответил никто.
 */
export const writeCommitMessage = async (
  ask: AskProvider,
  chain: readonly AiChoice[],
  diff: CommitDiff,
  dataDir: string,
): Promise<CommitMessage> => {
  const prompt = commitPrompt(diff)
  const refusals: string[] = []

  for (const choice of chain) {
    const answer = await ask(choice.provider, {
      prompt,
      schema: COMMIT_MESSAGE_SCHEMA,
      model: modelOf(choice),
      effort: choice.effort,
      cwd: join(dataDir, 'commit-message'),
      timeoutMs: ASK_MS,
      signal: AbortSignal.timeout(ASK_MS),
    })

    if ('error' in answer) {
      refusals.push(`${choice.provider}: ${answer.error}`)
      continue
    }

    const message = commitMessageOf(answer.output ?? jsonOf(answer.text))

    if (message) return { message, by: choice.provider }

    refusals.push(`${choice.provider}: the answer has no commit message.`)
  }

  return { refusals }
}
