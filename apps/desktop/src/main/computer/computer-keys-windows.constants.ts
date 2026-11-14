import { FLAG } from './cg-events.constants'
import type { Modifier } from './computer.types'

/** Буквы и цифры Windows: виртуальный код - код заглавной буквы и цифры в ASCII. */
const LETTERS_AND_DIGITS = Object.fromEntries(
  [...'abcdefghijklmnopqrstuvwxyz0123456789'].map((name) => [
    name,
    name.toUpperCase().charCodeAt(0),
  ]),
)

/** F1-F24 - VK_F1 (0x70) и дальше подряд. */
const FUNCTION_KEYS = Object.fromEntries(
  Array.from({ length: 24 }, (_, index) => [`f${index + 1}`, 0x70 + index]),
)

/**
 * Виртуальные коды клавиш Windows (VK_* из WinUser.h) под теми же именами, что у мака: модель
 * пишет одни и те же «return», «page_down», «cmd+t» на любой системе. Знаки - клавиши OEM
 * американской раскладки: Windows жмёт физическую клавишу, как и мак.
 */
export const WINDOWS_KEY_CODES: Readonly<Record<string, number>> = {
  ...LETTERS_AND_DIGITS,
  ...FUNCTION_KEYS,
  return: 0x0d,
  tab: 0x09,
  space: 0x20,
  backspace: 0x08,
  escape: 0x1b,
  delete: 0x2e,
  insert: 0x2d,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  '-': 0xbd,
  '=': 0xbb,
  '[': 0xdb,
  ']': 0xdd,
  '\\': 0xdc,
  ';': 0xba,
  "'": 0xde,
  ',': 0xbc,
  '.': 0xbe,
  '/': 0xbf,
  '`': 0xc0,
}

/**
 * Модификаторы Windows. Флаг - только чтобы отличать зажатые модификаторы друг от друга: события
 * Windows несут состояние клавиш сами. win - клавиша Windows.
 */
export const WINDOWS_MODIFIERS: Readonly<Record<string, Modifier>> = {
  control: { code: 0x11, flag: FLAG.control },
  shift: { code: 0x10, flag: FLAG.shift },
  option: { code: 0x12, flag: FLAG.option },
  win: { code: 0x5b, flag: FLAG.command },
}

/**
 * Другие имена модификаторов Windows. cmd - главный модификатор мака, на Windows его место
 * занимает Ctrl: «cmd+c» модели копирует и здесь. super и meta - клавиша Windows, как в xdotool.
 */
export const WINDOWS_MODIFIER_ALIASES: Readonly<Record<string, string>> = {
  cmd: 'control',
  command: 'control',
  ctrl: 'control',
  controll: 'control',
  controlr: 'control',
  alt: 'option',
  opt: 'option',
  altl: 'option',
  altr: 'option',
  shiftl: 'shift',
  shiftr: 'shift',
  windows: 'win',
  super: 'win',
  superl: 'win',
  superr: 'win',
  meta: 'win',
  metal: 'win',
  metar: 'win',
}

/**
 * Клавиши «расширенного» ряда: стрелки, Home, End, Page Up/Down, Insert, Delete, клавиша Windows.
 * Без пометки EXTENDEDKEY Windows принял бы их за клавиши цифрового блока.
 */
export const WINDOWS_EXTENDED_KEYS: ReadonlySet<number> = new Set([
  0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0x5b, 0x5c,
])
