/** Вкладка вида Extensions: свои расширения или магазин. */
export type ExtensionsTab = 'installed' | 'store'

/** Что открыто окном поверх вида: расширение, новое с ИИ, правка с ИИ, карточка из магазина. */
export type ExtensionsPanel =
  | { kind: 'extension'; id: string }
  | { kind: 'new' }
  | { kind: 'edit'; id: string }
  | { kind: 'listing'; id: string }
  | { kind: 'publish'; id: string }
  | null
