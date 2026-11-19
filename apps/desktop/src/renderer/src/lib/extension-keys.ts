/**
 * Клавиши команд расширений (ADR 0091): «cmd+shift+k» из манифеста - знаками мака для подписи и
 * проверкой нажатия. cmd на Windows - Ctrl: нажатие сюда приходит уже через withMacKeys.
 */

const GLYPHS: Record<string, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', cmd: '⌘' }
/** Порядок модификаторов в подписи - как у Apple: ⌃⌥⇧⌘. */
const ORDER = ['ctrl', 'alt', 'shift', 'cmd']

const NAMED: Record<string, string> = {
  enter: '↩',
  space: 'Space',
  tab: '⇥',
  escape: 'Esc',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  backspace: '⌫',
  delete: '⌦',
}

/** Код клавиши (KeyboardEvent.code) - имя клавиши в манифесте, не зависит от раскладки. */
const CODE_NAMES: Record<string, string> = {
  Enter: 'enter',
  NumpadEnter: 'enter',
  Space: 'space',
  Tab: 'tab',
  Escape: 'escape',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Backspace: 'backspace',
  Delete: 'delete',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  Equal: '=',
  Minus: '-',
}

const split = (keys: string) => {
  const parts = keys.toLowerCase().split('+')
  const key = parts.at(-1) ?? ''

  return { modifiers: new Set(parts.slice(0, -1)), key }
}

/** Знаки клавиш для Kbd: ['⇧', '⌘', 'K']. */
export const extensionKeyGlyphs = (keys: string): string[] => {
  const { modifiers, key } = split(keys)

  return [
    ...ORDER.filter((modifier) => modifiers.has(modifier)).map(
      (modifier) => GLYPHS[modifier] ?? modifier,
    ),
    NAMED[key] ?? key.toUpperCase(),
  ]
}

/** Подпись клавиш строкой в нотации мака: «⇧⌘K» - так их ждёт поиск действий. */
export const extensionKeyLabel = (keys: string): string => extensionKeyGlyphs(keys).join('')

/** Имя нажатой клавиши в словаре манифеста; null - такой клавиши у команд не бывает. */
const pressedKey = (code: string): string | null => {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^F(?:[1-9]|1[0-2])$/.test(code)) return code.toLowerCase()

  return CODE_NAMES[code] ?? null
}

type Stroke = Pick<KeyboardEvent, 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>

/** Нажатие - эти клавиши команды: ровно эти модификаторы и эта клавиша. */
export const matchesExtensionKeys = (keys: string, event: Stroke): boolean => {
  const { modifiers, key } = split(keys)

  return (
    pressedKey(event.code) === key &&
    event.metaKey === modifiers.has('cmd') &&
    event.ctrlKey === modifiers.has('ctrl') &&
    event.altKey === modifiers.has('alt') &&
    event.shiftKey === modifiers.has('shift')
  )
}
