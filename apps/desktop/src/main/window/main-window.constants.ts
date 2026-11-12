export const DEFAULT_WINDOW_SIZE = { width: 1440, height: 900 }

/**
 * Уже окно не бывает. Ширина - чтобы обе боковые панели на своём минимуме (180 и 300) и
 * место середины на своём (308 вместе с зазором, MAIN_MIN_WIDTH окна) влезли рядом с
 * полосами иконок, отступами и остальными зазорами (180): иначе показать середину по
 * просьбе в узком окне было бы нельзя. Сменились минимумы, полосы или зазоры - пересчитать.
 */
export const MIN_WINDOW_SIZE = { width: 968, height: 600 }

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
