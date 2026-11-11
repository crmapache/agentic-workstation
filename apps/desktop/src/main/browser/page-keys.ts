/**
 * Клавиши для CDP (`Input.dispatchKeyEvent`): сочетание словами модели («Control+Shift+A»,
 * «Enter», «Meta+a») → события нажатия. Чистая функция, держит тест.
 */

type KeyDef = { key: string; code: string; keyCode: number; text?: string }

/** Биты модификаторов CDP. */
const MODIFIER_BITS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 } as const

type Modifier = keyof typeof MODIFIER_BITS

const MODIFIER_KEYS: Record<Modifier, KeyDef> = {
  Alt: { key: 'Alt', code: 'AltLeft', keyCode: 18 },
  Control: { key: 'Control', code: 'ControlLeft', keyCode: 17 },
  Meta: { key: 'Meta', code: 'MetaLeft', keyCode: 91 },
  Shift: { key: 'Shift', code: 'ShiftLeft', keyCode: 16 },
}

/** Как модели называют модификаторы. ControlOrMeta - как в Playwright: на Mac это Meta. */
const MODIFIER_ALIASES: Record<string, Modifier> = {
  alt: 'Alt',
  option: 'Alt',
  control: 'Control',
  ctrl: 'Control',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  controlormeta: 'Meta',
  mod: 'Meta',
  shift: 'Shift',
}

const NAMED: Record<string, KeyDef> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  return: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  insert: { key: 'Insert', code: 'Insert', keyCode: 45 },
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `f${index + 1}`,
      { key: `F${index + 1}`, code: `F${index + 1}`, keyCode: 112 + index },
    ]),
  ),
}

/**
 * Правка текста на Mac: Chrome не делает «выделить всё» по Meta+A из CDP сам - нужна команда
 * редактора в событии, как у Playwright.
 */
const MAC_COMMANDS: Record<string, string> = {
  'Meta+a': 'selectAll',
  'Meta+c': 'copy',
  'Meta+x': 'cut',
  'Meta+v': 'paste',
  'Meta+z': 'undo',
  'Meta+Shift+z': 'redo',
}

/** Буква, цифра или любой знак: код клавиши - как у английской раскладки. */
const charKey = (char: string, shift: boolean): KeyDef => {
  const upper = char.toUpperCase()

  if (/^[a-z]$/i.test(char)) {
    const key = shift ? upper : char.toLowerCase()

    return { key, code: `Key${upper}`, keyCode: upper.charCodeAt(0), text: key }
  }

  if (/^[0-9]$/.test(char))
    return { key: char, code: `Digit${char}`, keyCode: char.charCodeAt(0), text: char }

  return { key: char, code: '', keyCode: 0, text: char }
}

export class KeyComboError extends Error {}

export type KeyEvent = {
  type: 'keyDown' | 'rawKeyDown' | 'keyUp'
  key: string
  code: string
  windowsVirtualKeyCode: number
  modifiers: number
  text?: string
  commands?: string[]
}

/**
 * События одного сочетания: модификаторы вниз, клавиша вниз и вверх, модификаторы вверх.
 * С Control, Alt или Meta клавиша текста не печатает (это команда, а не ввод).
 */
export const keyEvents = (combo: string): KeyEvent[] => {
  // Сама клавиша «+» - последняя: «Shift++», «+».
  const plus = combo === '+' || combo.endsWith('++')
  const head = plus ? combo.slice(0, -2) : combo
  const parts = head ? head.split('+').map((part) => part.trim()) : []
  const keyName = plus ? '+' : (parts.pop() ?? '')
  const modifiers = parts.map((part) => {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()]

    if (!modifier) throw new KeyComboError(`Unknown modifier "${part}" in "${combo}"`)

    return modifier
  })
  const bits = modifiers.reduce((sum, modifier) => sum | MODIFIER_BITS[modifier], 0)
  const named = NAMED[keyName.toLowerCase()]

  if (!named && [...keyName].length !== 1) throw new KeyComboError(`Unknown key "${keyName}"`)

  const def = named ?? charKey(keyName, modifiers.includes('Shift'))
  const printing = def.text !== undefined && !modifiers.some((modifier) => modifier !== 'Shift')
  // Порядок модификаторов в имени команды - по алфавиту, как в MAC_COMMANDS.
  const command = MAC_COMMANDS[[...[...modifiers].sort(), def.key.toLowerCase()].join('+')]
  const base = (item: KeyDef) => ({
    key: item.key,
    code: item.code,
    windowsVirtualKeyCode: item.keyCode,
    modifiers: bits,
  })
  const held = modifiers.map((modifier) => MODIFIER_KEYS[modifier])

  return [
    ...held.map((item): KeyEvent => ({ type: 'rawKeyDown', ...base(item) })),
    {
      type: printing ? 'keyDown' : 'rawKeyDown',
      ...base(def),
      ...(printing && def.text ? { text: def.text } : {}),
      ...(command ? { commands: [command] } : {}),
    },
    { type: 'keyUp', ...base(def) },
    ...[...held].reverse().map((item): KeyEvent => ({ type: 'keyUp', ...base(item) })),
  ]
}

/** Нажатия одного знака текста - для ввода «медленно», по клавише (подсказки, автодополнение). */
export const charEvents = (char: string): KeyEvent[] => {
  const def =
    char === '\n' ? (NAMED['enter'] as KeyDef) : charKey(char, char !== char.toLowerCase())
  const base = { key: def.key, code: def.code, windowsVirtualKeyCode: def.keyCode, modifiers: 0 }

  return [
    { type: 'keyDown', ...base, ...(def.text ? { text: def.text } : {}) },
    { type: 'keyUp', ...base },
  ]
}
