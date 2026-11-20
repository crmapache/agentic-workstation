import type { CommitPushStage, CommitPushResult } from '@shared/commit-push'
import type { AiChoice } from '@shared/ide-prefs'
import { MINUTE_MS } from '@shared/time-units'

import { readHead, hasCommits } from '../git-head'
import { push } from '../git-remote'
import { gitAction } from '../git-runner'
import { queueGitWrite } from '../git-write-queue'
import type { AskProvider } from '../../providers/ask-provider'
import { readCommitDiff } from './commit-diff'
import { writeCommitMessage } from './commit-writer'

/** Коммит ждёт хуков человека (линтер, тесты в pre-commit) - это минуты, а не секунды. */
const COMMIT_TIMEOUT_MS = 10 * MINUTE_MS

/** Что нужно кнопке от IDE: разовый вопрос провайдеру, цепочка из Settings и папка данных. */
export type CommitPushHost = {
  ask: AskProvider
  chain: () => readonly AiChoice[]
  dataDir: string
}

const failed = (stage: CommitPushStage, details: string): CommitPushResult => ({
  outcome: 'failed',
  stage,
  details,
})

/**
 * Commit and push: все изменения проекта одним коммитом с сообщением от ИИ и push текущей ветки
 * (без upstream - публикуется, как Push из меню ветки; force нет). Сообщение пишется до того,
 * как тронут индекс: отказ всех провайдеров ничего не меняет. Коммит - в очереди записывающих
 * команд проекта, push встаёт в неё следом.
 */
export const commitAndPush = async (
  host: CommitPushHost,
  rootPath: string,
): Promise<CommitPushResult> => {
  const head = await readHead(rootPath)

  if (head?.kind !== 'branch') return failed('detached', 'Check out a branch to commit and push.')

  const diff = await readCommitDiff(rootPath, await hasCommits(rootPath))

  if (!diff) return failed('nothing', 'There is nothing to commit.')

  const written = await writeCommitMessage(host.ask, host.chain(), diff, host.dataDir)

  if ('refusals' in written) return failed('message', written.refusals.join('\n'))

  const committed = await queueGitWrite(rootPath, async () => {
    const added = await gitAction(rootPath, ['add', '-A'], COMMIT_TIMEOUT_MS)

    return added.ok
      ? gitAction(rootPath, ['commit', '-m', written.message], COMMIT_TIMEOUT_MS)
      : added
  })

  if (!committed.ok) return failed('commit', committed.details)

  const pushed = await push(rootPath)

  return pushed.ok
    ? { outcome: 'pushed', message: written.message, by: written.by, summary: pushed.summary }
    : { outcome: 'committed', message: written.message, by: written.by, details: pushed.details }
}

/**
 * Одно нажатие на проект за раз: второе, пока первое пишет сообщение, получает тот же итог, а
 * не второй коммит из пустоты.
 */
export class CommitPushDesk {
  private readonly running = new Map<string, Promise<CommitPushResult>>()

  constructor(private readonly host: CommitPushHost) {}

  run(rootPath: string): Promise<CommitPushResult> {
    const known = this.running.get(rootPath)

    if (known) return known

    const work = commitAndPush(this.host, rootPath).finally(() => this.running.delete(rootPath))

    this.running.set(rootPath, work)

    return work
  }
}
