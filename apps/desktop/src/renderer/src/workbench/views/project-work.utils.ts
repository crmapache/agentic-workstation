import type { Conversation } from '@shared/claude'
import type { RunSummary } from '@shared/scenario-runs'
import type { TaskRunSummary } from '@shared/tasks'

import { worksOnItsOwn } from '../../features/claude-code/StatusDot/StatusDot.utils'
import type { ProjectWork } from '../../features/projects/ProjectTab/ProjectTab.types'

type WorkingConversation = Parameters<typeof worksOnItsOwn>[0] &
  Pick<Conversation, 'id' | 'projectPath'>

type WorkingRun = Pick<RunSummary, 'id' | 'projectPath' | 'state' | 'asking'>

/** Слова строки подсказки: разговор и прогон сценария - своими. */
type WorkText<C, R> = { chat: (conversation: C) => string; run: (run: R) => string }

/**
 * Прогон сценария работает сам: начинается или идёт и ни о чём не спрашивает. Пауза, стоп на
 * вопросе и упор в лимит - ждут человека, о них говорит число на иконке сценариев.
 */
export const runWorks = (run: Pick<RunSummary, 'state' | 'asking'>): boolean =>
  (run.state === 'starting' || run.state === 'running') && run.asking === ''

/**
 * Что в проекте работает само, без человека: разговоры, чья вкладка горит «работает»
 * (worksOnItsOwn), и идущие прогоны сценариев (их worktree - тоже работа проекта). Разговоры -
 * первыми, в порядке состояния.
 */
export const projectWork = <C extends WorkingConversation, R extends WorkingRun>(
  conversations: readonly C[],
  runs: readonly R[],
  rootPath: string,
  text: WorkText<C, R>,
): ProjectWork[] => [
  ...conversations
    .filter((conversation) => conversation.projectPath === rootPath && worksOnItsOwn(conversation))
    .map((conversation) => ({ id: conversation.id, text: text.chat(conversation) })),
  ...runs
    .filter((run) => run.projectPath === rootPath && runWorks(run))
    .map((run) => ({ id: run.id, text: text.run(run) })),
]

/**
 * Прогоны заданий по расписанию (ADR 0069), что работают сами: идут и ни о чём не спрашивают.
 * Ждущий ответа - не работа: о нём говорят уведомления и число на иконке заданий.
 */
export const taskWork = <T extends Pick<TaskRunSummary, 'id' | 'projectPath' | 'state'>>(
  runs: readonly T[],
  rootPath: string,
  text: (run: T) => string,
): ProjectWork[] =>
  runs
    .filter((run) => run.projectPath === rootPath && run.state === 'running')
    .map((run) => ({ id: run.id, text: text(run) }))
