export const DEFAULT_WINDOW_SIZE = { width: 1440, height: 900 }

/**
 * Уже окно не бывает. Ширина - ровно под разговор на его минимуме (250, PANEL_MIN_WIDTH окна)
 * рядом с тремя полосами иконок: окно ставят узкой колонкой ради разговора (просьба
 * владельца). 422 = 250 + полосы 3 × 44 + зазоры 4 × 8 + поля окна 2 × 8 - зазор, который
 * свёрнутая середина отдаёт разговору. Левой панели и середине в таком окне места нет:
 * раскладка прячет их сама (state/layout.utils.ts). Сменились минимум разговора, полосы
 * или зазоры - пересчитать.
 */
export const MIN_WINDOW_SIZE = { width: 422, height: 600 }

/**
 * Фон окна до первой отрисовки страницы. Совпадает с --color-bg-app из
 * packages/ui/src/styles/tokens.css: иначе при старте мелькает белый прямоугольник.
 */
export const WINDOW_BACKGROUND = '#050505'

/**
 * Кнопки окна Windows (свернуть, развернуть, закрыть) рисует система поверх шапки справа
 * (titleBarOverlay): подложка - цвет шапки (--color-surface-chrome), знаки - --color-fg-muted.
 * Значения - те же, что у токенов в packages/ui/src/styles/tokens.css: окно рисует кнопки до
 * страницы и токенов не видит.
 */
export const WINDOW_CONTROLS_COLOR = '#040405'
export const WINDOW_CONTROLS_SYMBOL_COLOR = '#abadb2'

/**
 * «Светофор» macOS - по центру шапки окна (trafficLightPosition): отступ слева и высота
 * кнопок, около 14px. Место под них слева - --size-traffic-lights.
 */
export const TRAFFIC_LIGHT_INSET = 16
export const TRAFFIC_LIGHT_SIZE = 14

/**
 * Высота шапки до того, как окно её померило, - --size-title-bar при обычном размере
 * текста. Дальше шапка растёт с размером текста, и окно присылает её высоту само.
 */
export const TITLE_BAR_HEIGHT = 40

/**
 * Высота шапки из окна - в этих пределах: шапка на самом мелком и самом крупном размере
 * текста с запасом. За ними - не шапка, а ошибка, и «светофор» не двигается.
 */
export const TITLE_BAR_HEIGHT_LIMITS = { min: 20, max: 120 }
