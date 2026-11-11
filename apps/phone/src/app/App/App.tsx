import { useState } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AppRoutes } from '../AppRoutes/AppRoutes'
import { ClientContext } from '../../lib/client'
import type { RemoteClient } from '../../remote/remote-client'
import { Toasts } from '../../shell/Toasts/Toasts'
import { QUERY_DEFAULTS } from './App.constants'
import { useClientLifecycle } from './App.hooks'

/**
 * Корень телефона: кэш React Query - зеркало IDE (подписка одна, state/mirror.ts), ядро Remote
 * Control в контексте, экран по адресу.
 */
export const App = ({ client }: { client: RemoteClient }) => {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: QUERY_DEFAULTS }))

  useClientLifecycle(client, queryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <ClientContext value={client}>
        <AppRoutes />
        <Toasts />
      </ClientContext>
    </QueryClientProvider>
  )
}
