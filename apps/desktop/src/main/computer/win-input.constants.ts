/**
 * Числа Windows для ввода и проверки окон (WinUser.h, winnt.h). Значения - из SDK Windows: они
 * часть двоичного интерфейса и между версиями не меняются.
 */

/** INPUT.type. */
export const INPUT_MOUSE = 0
export const INPUT_KEYBOARD = 1

/** MOUSEINPUT.dwFlags: кнопки и колесо (движение - SetCursorPos, точно до пикселя). */
export const MOUSEEVENTF = {
  leftDown: 0x0002,
  leftUp: 0x0004,
  rightDown: 0x0008,
  rightUp: 0x0010,
  middleDown: 0x0020,
  middleUp: 0x0040,
  wheel: 0x0800,
  hwheel: 0x1000,
} as const

/** KEYBDINPUT.dwFlags. */
export const KEYEVENTF = {
  extendedKey: 0x0001,
  keyUp: 0x0002,
  unicode: 0x0004,
} as const

/** Один щелчок колеса в единицах Windows. */
export const WHEEL_DELTA = 120

/** MapVirtualKeyW: виртуальный код - скан-код клавиши (его ждут игры и удалённые столы). */
export const MAPVK_VK_TO_VSC = 0

/** GetAncestor: окно верхнего уровня, которому принадлежит дочернее под курсором. */
export const GA_ROOT = 2

/** OpenProcess: ровно столько прав, сколько нужно спросить токен, - даёт и чужой процесс. */
export const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

export const TOKEN_QUERY = 0x0008

/** TOKEN_INFORMATION_CLASS: TokenElevation - запущен ли процесс от администратора. */
export const TOKEN_ELEVATION = 20

/** GetSystemMetrics: кнопки мыши переставлены (основная - правая, для левшей). */
export const SM_SWAPBUTTON = 23

/** Кнопки мыши для GetAsyncKeyState. */
export const VK_LBUTTON = 0x01
export const VK_RBUTTON = 0x02

/** Старший бит ответа GetAsyncKeyState - клавиша зажата сейчас. */
export const KEY_DOWN_BIT = 0x8000

/**
 * Системные курсоры (OCR_*), которые на время работы ИИ подменяются пустыми (ADR 0079): стрелка,
 * текст, ожидание, крест, стрелка вверх, четыре размера, перенос, запрет, рука, фоновая работа,
 * справка. Чужое окно ставит любой из них - пустыми должны быть все.
 */
export const SYSTEM_CURSORS = [
  32512, 32513, 32514, 32515, 32516, 32642, 32643, 32644, 32645, 32646, 32648, 32649, 32650, 32651,
] as const

/** Пустой курсор: сторона в пикселях и маски - AND вся в единицах (прозрачно), XOR - в нулях. */
export const BLANK_CURSOR_SIDE = 32
export const BLANK_CURSOR_MASK_BYTES = (BLANK_CURSOR_SIDE * BLANK_CURSOR_SIDE) / 8

/** CopyImage: копия курсора. */
export const IMAGE_CURSOR = 2

/** SystemParametersInfoW: перечитать курсоры человека из реестра - вернуть его схему. */
export const SPI_SETCURSORS = 0x0057

/**
 * Окна для сверки экрана (ADR 0129): расширенный стиль окна (GetWindowLongPtrW), его биты «поверх
 * всех» и «клики насквозь» (прозрачное слоёное окно - стрелка ИИ, оверлеи), DWM «окно скрыто»
 * (приложение Магазина на другом рабочем столе формально видимо) и «окно не закрыто от захвата».
 */
export const GWL_EXSTYLE = -20
export const WS_EX_TOPMOST = 0x0008
export const WS_EX_TRANSPARENT = 0x0020
export const WS_EX_LAYERED = 0x0008_0000
export const DWMWA_CLOAKED = 14
export const WDA_NONE = 0

/** LASTINPUTINFO: размер структуры, который Windows сверяет в cbSize. */
export const LAST_INPUT_INFO_SIZE = 8
