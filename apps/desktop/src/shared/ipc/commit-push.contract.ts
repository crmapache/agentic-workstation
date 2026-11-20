import type { CommitPushResult } from '../commit-push'

type ProjectRequest = { projectId: string }

/**
 * Часть контракта (contract.ts) про кнопку Commit and push в шапке: все изменения проекта одним
 * коммитом с сообщением от ИИ и push текущей ветки. Отдельным файлом по области
 * (.claude/rules/ipc-contract.md).
 */
export type CommitPushInvokeContract = {
  'git:commitAndPush': { request: ProjectRequest; response: CommitPushResult }
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const COMMIT_PUSH_CHANNELS = {
  'git:commitAndPush': true,
} satisfies Record<keyof CommitPushInvokeContract, true>
