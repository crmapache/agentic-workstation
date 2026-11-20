import type { IdePrefsInvokeContract } from '@shared/ipc/ide-prefs.contract'

import type { IdePrefsService } from '../ide-prefs/ide-prefs-service'
import type { InvokeHandlers } from './handle'

type IdePrefsChannels = keyof IdePrefsInvokeContract

/** Каналы общих настроек IDE: правку разбирает сервис. */
export const createIdePrefsHandlers = (
  idePrefs: IdePrefsService,
): Pick<InvokeHandlers, IdePrefsChannels> => ({
  'idePrefs:get': () => idePrefs.value,
  'idePrefs:set': ({ patch }) => idePrefs.set(patch),
})
