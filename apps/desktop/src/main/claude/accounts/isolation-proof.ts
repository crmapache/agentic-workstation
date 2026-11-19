import type { AccountCapability } from '@shared/panel-extras'

import type { AuthStatus } from './auth-status'

/** authMethod подписки Claude - единственный вид входа, который держит хранилище. */
const SUBSCRIPTION_METHOD = 'claude.ai'

/**
 * Что доказывают ответы пробы аккаунтов (как в ACC, IsolationProof): умеет ли этот CLI
 * держать два входа порознь. plain - CLI без переменной хранилища; reference - живой вход
 * (обычный, а если из него вышли - добавленное хранилище, которое отвечает «вошёл»);
 * isolated - заведомо пустое хранилище (null - его не удалось назвать).
 *
 * Слишком строго - машина, на которой механизм доказан делом, лишается кнопки Add.
 * Слишком мягко - второй вход ложится в хранилище, на котором человек работает, и
 * затирает его. Поэтому нужны обе половины сразу: вход переехал И папка разговоров та же.
 */
export const isolationVerdict = (
  plain: AuthStatus,
  reference: AuthStatus | null,
  isolated: AuthStatus | null,
): AccountCapability => {
  // Живого входа нет нигде: пустое выбранное и пустое проигнорированное не различить.
  if (!reference?.loggedIn) return 'not_signed_in'

  // Ключ API из окружения старше любого хранилища: второй аккаунт не переключить.
  if (reference.method && reference.method !== SUBSCRIPTION_METHOD) return 'api_key'

  if (!isolated) return 'ignored'

  const moved = !isolated.loggedIn
  // Поле обязано быть в обоих ответах: старые сборки его не шлют, а два «нет» равны.
  const folderStayed =
    plain.projectsDirectory !== '' &&
    [reference, isolated].every((answer) => answer.projectsDirectory === plain.projectsDirectory)

  return moved && folderStayed ? 'supported' : 'ignored'
}
