import { useEffect } from 'react'

import type { QueryClient } from '@tanstack/react-query'

import { takePairingCode } from '../../lib/pairing-link'
import { useRouter } from '../../lib/router.store'
import type { RemoteClient } from '../../remote/remote-client'
import { mirrorClient } from '../../state/mirror'
import { usePairingStore } from '../../state/pairing.store'

/**
 * Жизнь страницы вокруг ядра: зеркало в кэш, линия на время жизни страницы, переподключение,
 * когда страница снова на виду или вернулась сеть, шаги браузера «назад» и код пары, пришедший
 * фрагментом в уже открытую страницу (без перезагрузки) - он стирается из адреса так же сразу.
 */
export const useClientLifecycle = (client: RemoteClient, queryClient: QueryClient) => {
  const synced = useRouter((state) => state.synced)

  useEffect(() => {
    const unmirror = mirrorClient(client, queryClient)
    const handleWake = () => {
      if (document.visibilityState === 'visible') client.wake()
    }
    const handleHash = () => {
      const taken = takePairingCode(window.location, window.history)

      if (taken.kind === 'none') return

      usePairingStore.getState().take(taken)
      synced()
    }

    client.start()
    document.addEventListener('visibilitychange', handleWake)
    window.addEventListener('online', handleWake)
    window.addEventListener('popstate', synced)
    window.addEventListener('hashchange', handleHash)

    return () => {
      unmirror()
      client.stop()
      document.removeEventListener('visibilitychange', handleWake)
      window.removeEventListener('online', handleWake)
      window.removeEventListener('popstate', synced)
      window.removeEventListener('hashchange', handleHash)
    }
  }, [client, queryClient, synced])
}
