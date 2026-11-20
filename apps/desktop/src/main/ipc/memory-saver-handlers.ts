import type { MemorySaverInvokeContract } from '@shared/ipc/memory-saver.contract'

import type { MemorySaverService } from '../memory-saver/memory-saver-service'
import type { InvokeHandlers } from './handle'

/** Окна разделяют настройку и фактическое состояние одного владельца служб редактора. */
export const createMemorySaverHandlers = (
  service: MemorySaverService,
): Pick<InvokeHandlers, keyof MemorySaverInvokeContract> => ({
  'memorySaver:get': () => service.state,
  'memorySaver:toggle': () => service.toggle(),
  'memorySaver:retry': () => service.retry(),
})
