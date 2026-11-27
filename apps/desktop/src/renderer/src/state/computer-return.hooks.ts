import { useIpcEvent } from '../lib/ipc.hooks'
import { PROVIDER_VIEW_OF } from './layout.constants'
import { useLayoutStore } from './layout.store'

/**
 * Работа на компьютере кончилась, IDE вышла вперёд с чатом, где она шла (ADR 0130): проект и
 * вкладку выбрал главный процесс, окну - открыть панель провайдера, даже если она свёрнута.
 */
export const useComputerReturnSync = () => {
  useIpcEvent('computer:returned', ({ provider }) => {
    useLayoutStore.getState().showProviderView(PROVIDER_VIEW_OF[provider])
  })
}
