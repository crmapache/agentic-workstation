import type { SoundsInvokeContract } from '@shared/ipc/sounds.contract'

import type { SoundsService } from '../sounds/sounds-service'
import type { InvokeHandlers } from './handle'

type SoundsChannels = keyof SoundsInvokeContract

/** Каналы звуков IDE (ADR 0046): настройку из окна разбирает сервис, негодное отбрасывая. */
export const createSoundsHandlers = (
  sounds: SoundsService,
): Pick<InvokeHandlers, SoundsChannels> => ({
  'sounds:get': () => sounds.prefs,
  'sounds:set': ({ prefs }) => sounds.set(prefs),
})
