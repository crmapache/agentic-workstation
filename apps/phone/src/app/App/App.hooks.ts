import { useEffect } from 'react'

import type { QueryClient } from '@tanstack/react-query'

import { takePairingCode } from '../../lib/pairing-link'
import { useRouter } from '../../lib/router.store'
import { parseRoute } from '../../lib/routes'
import type { PushSetup } from '../../push/push-setup'
import type { RemoteClient } from '../../remote/remote-client'
import { mirrorClient } from '../../state/mirror'
import { usePairingStore } from '../../state/pairing.store'
import type { OpenScreenMessage } from '../../sw/sw.types'
import { OPEN_SCREEN } from '../../sw/sw.types'

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

const isOpenScreen = (value: unknown): value is OpenScreenMessage =>
  typeof value === 'object' &&
  value !== null &&
  (value as { k?: unknown }).k === OPEN_SCREEN &&
  typeof (value as { url?: unknown }).url === 'string'

/**
 * Уведомления: что с ними сейчас - при запуске и когда страница снова на виду (разрешение
 * могли поменять в настройках телефона). Нажатое уведомление при открытом окне приходит словом
 * воркера, и окно переходит на экран без перезагрузки - линия с IDE остаётся.
 */
export const useNotifications = (push: PushSetup) => {
  const navigate = useRouter((state) => state.navigate)

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') void push.start()
    }
    const handleWorker = (event: MessageEvent) => {
      if (!isOpenScreen(event.data)) return

      const route = parseRoute(event.data.url)

      if (route.name !== 'notFound') navigate(route)
    }
    const worker = 'serviceWorker' in navigator ? navigator.serviceWorker : null

    void push.start()
    document.addEventListener('visibilitychange', handleVisible)
    worker?.addEventListener('message', handleWorker)

    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      worker?.removeEventListener('message', handleWorker)
    }
  }, [push, navigate])
}
