import { use, createContext } from 'react'

import { browserPushEnvironment } from '../push/push-browser'
import { PushSetup } from '../push/push-setup'
import type { RemoteClient } from '../remote/remote-client'
import { usePushStore } from '../state/push.store'

/**
 * Уведомления страницы: окружение браузера, подписка уходит в ядро (каждой IDE), состояние - в
 * стор экранов. Кнопки экрана зовут enable и disable через контекст.
 */
export const bootPush = (client: RemoteClient): PushSetup =>
  new PushSetup(
    browserPushEnvironment(),
    (subscription) => client.setPushSubscription(subscription),
    (status) => usePushStore.getState().setStatus(status),
  )

export const PushContext = createContext<PushSetup | null>(null)

export const usePush = (): PushSetup => {
  const push = use(PushContext)

  if (!push) throw new Error('usePush outside of PushContext')

  return push
}
