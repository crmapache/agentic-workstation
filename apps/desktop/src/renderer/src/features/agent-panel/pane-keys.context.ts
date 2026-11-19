import { createContext } from 'react'

/** Слушатель клавиш панели разговора; true - клавиша его, дальше не идёт. */
export type PaneKeyListener = (event: KeyboardEvent, composerEmpty: boolean) => boolean

/** Регистрация слушателя клавиш панели; возвращает отписку. */
export type PaneKeys = { register: (listener: PaneKeyListener) => () => void }

/**
 * Клавиши всей панели разговора (как в ACC - по окну плагина): цифры и Enter карточек
 * над полем, Esc, Shift+Tab. Только внутри панели: в дереве файлов и редакторе эти
 * клавиши не её.
 */
export const PaneKeysContext = createContext<PaneKeys | null>(null)
