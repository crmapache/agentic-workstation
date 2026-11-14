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
