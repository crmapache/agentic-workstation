import type { ProviderId } from './providers'

/**
 * На каком шаге «Commit and push» встал: nothing - коммитить нечего, detached - не на ветке,
 * message - ни один провайдер из цепочки не написал сообщение (details - их отказы), commit -
 * отказал git (хук, конфликт).
 */
export type CommitPushStage = 'nothing' | 'detached' | 'message' | 'commit'

/**
 * Итог кнопки Commit and push: pushed - коммит ушёл; committed - коммит лёг, а push отказал (его
 * слова в details); failed - коммита нет. by - провайдер, который написал сообщение.
 */
export type CommitPushResult =
  | { outcome: 'pushed'; message: string; by: ProviderId; summary: string }
  | { outcome: 'committed'; message: string; by: ProviderId; details: string }
  | { outcome: 'failed'; stage: CommitPushStage; details: string }
