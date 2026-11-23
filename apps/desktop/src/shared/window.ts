/**
 * Команда меню приложения, которая принадлежит окну целиком, а не одному виду: открыть
 * настройки IDE (⌘,), сделать текст крупнее, мельче или вернуть как было (⌘+, ⌘-, ⌘0).
 */
export type WindowCommand = 'openSettings' | 'textSizeUp' | 'textSizeDown' | 'textSizeReset'

/**
 * Полоса иконок окна (ADR 0112): side - левая, виды левой панели; main - вторая слева, виды
 * середины; provider - правая, GUI провайдеров LLM.
 */
export type ActivityBarId = 'side' | 'main' | 'provider'

/** Полосы окна слева направо: так они идут и в меню View. */
export const ACTIVITY_BAR_IDS: readonly ActivityBarId[] = ['side', 'main', 'provider']

/** Кнопка полосы в меню View: галочка - стоит ли она в полосе. */
export type BarMenuButton = { id: string; label: string; shown: boolean }

/**
 * Полоса в меню View: её кнопки по группам сверху вниз (виды, потом низ полосы) - в том
 * порядке, в каком они стоят в полосе, вместе со спрятанными. Пустых групп нет.
 */
export type BarMenuEntry = { bar: ActivityBarId; groups: BarMenuButton[][] }

/**
 * Что нажали в меню View: поставили или сняли галочку кнопки полосы (shown - какой она стала:
 * меню могло отстать от окна, поэтому не «переключить»), вернули полосе порядок и кнопки как было
 * с самого начала.
 */
export type BarMenuCommand =
  | { kind: 'setShown'; bar: ActivityBarId; id: string; shown: boolean }
  | { kind: 'reset'; bar: ActivityBarId }
