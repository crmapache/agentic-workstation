import { use, createContext } from 'react'

import { relayUrlOfPage } from '@agentic-workstation/remote-protocol/pairing-url'

import { openKeyStore } from '../remote/keystore-idb'
import type { SocketLike } from '../remote/relay-socket'
import { RemoteClient } from '../remote/remote-client'

/** Как телефон представляется IDE (hello): имя клиента и версия сборки. */
export const CLIENT_INFO = { name: 'agentic-workstation-phone', version: '0.1.0' }

/**
 * Ядро Remote Control страницы: хранилище пар в IndexedDB, релей - тот же хост, что отдал
 * страницу (в dev - прокси Vite к локальному релею).
 */
export const bootClient = async (): Promise<RemoteClient> =>
  RemoteClient.create({
    store: await openKeyStore(),
    relayUrl: relayUrlOfPage(window.location.origin),
    createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    client: CLIENT_INFO,
  })

export const ClientContext = createContext<RemoteClient | null>(null)

/** Ядро Remote Control - экранам: команды, подписки, пары. Данные - через React Query. */
export const useClient = (): RemoteClient => {
  const client = use(ClientContext)

  if (!client) throw new Error('useClient outside of ClientContext')

  return client
}
