import type { RemoteInvokeContract } from '@shared/ipc/remote.contract'

import { isAddress } from '@agentic-workstation/remote-protocol/frame'

import type { RemoteService } from '../remote/remote-service'
import type { InvokeHandlers } from './handle'

type RemoteChannels = keyof RemoteInvokeContract

/** Каналы Remote Control (ADR 0041): проверить запрос и позвать сервис. */
export const createRemoteHandlers = (
  remote: RemoteService,
): Pick<InvokeHandlers, RemoteChannels> => ({
  'remote:get': () => remote.view(),
  'remote:setEnabled': ({ enabled }) => remote.setEnabled(enabled === true),
  'remote:startPairing': () => remote.startPairing(),
  'remote:approve': () => remote.approve(),
  'remote:refuse': () => remote.refuse(),
  'remote:revoke': ({ deviceId }) => {
    // Отпускают только спаренный телефон: чужой адрес из окна - не повод писать надгробие.
    if (!isAddress(deviceId) || !remote.knows(deviceId)) throw new Error('Такого телефона нет')

    return remote.revoke(deviceId)
  },
})
