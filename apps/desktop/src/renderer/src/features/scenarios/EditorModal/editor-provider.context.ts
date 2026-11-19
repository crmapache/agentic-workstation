import { useContext, createContext } from 'react'

import type { ProviderInfo } from '@shared/providers'

/**
 * Провайдер сценария в редакторе (голова, `head.provider`): его модели, уровни усилия и режимы
 * у головы и у каждой карточки (null - список провайдеров ещё не пришёл); модель головы -
 * уровни карточки с пустой моделью считаются по ней.
 */
export type EditorProvider = { provider: ProviderInfo | null; headModel: string }

export const EditorProviderContext = createContext<EditorProvider>({
  provider: null,
  headModel: '',
})

export const useEditorProvider = (): EditorProvider => useContext(EditorProviderContext)
