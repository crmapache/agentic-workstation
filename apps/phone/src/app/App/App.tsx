import { useState } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AppRoutes } from '../AppRoutes/AppRoutes'
import { ClientContext } from '../../lib/client'
import { PushContext } from '../../lib/push'
import type { PushSetup } from '../../push/push-setup'
import type { RemoteClient } from '../../remote/remote-client'
import { QUERY_DEFAULTS } from './App.constants'
import { useNotifications, useClientLifecycle } from './App.hooks'

/**
 * Корень телефона: кэш React Query - зеркало IDE (подписка одна, state/mirror.ts), ядро Remote
 * Control и уведомления (пуши) в контексте, экран по адресу. Всплывающие уведомления об отказах
 * ставит сам экран - над своим низом.
 */
export const App = ({ client, push }: { client: RemoteClient; push: PushSetup }) => {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: QUERY_DEFAULTS }))

  useClientLifecycle(client, queryClient)
  useNotifications(push)

  return (
    <QueryClientProvider client={queryClient}>
      <ClientContext value={client}>
        <PushContext value={push}>
          <AppRoutes />
        </PushContext>
      </ClientContext>
    </QueryClientProvider>
  )
}
