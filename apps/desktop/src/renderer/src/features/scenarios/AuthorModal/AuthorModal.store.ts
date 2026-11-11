import { create } from 'zustand'

import type { AuthorState, AuthorStore } from './AuthorModal.types'

const EMPTY: AuthorState = { description: '', scope: null, drafting: null, error: '' }

/**
 * Форма нового сценария вне React: модель пишет черновик минутами, а окно размонтируется от
 * взгляда на соседний вид середины. Набранное описание, выбранная полка и номер идущего запроса
 * переживают это, и ответ, пришедший без окна, всё равно находит, куда лечь.
 */
export const useAuthorStore = create<AuthorStore>((set) => ({
  ...EMPTY,
  update: (patch) => set(patch),
  reset: () => set(EMPTY),
}))
