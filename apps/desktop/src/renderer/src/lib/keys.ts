import { IS_MAC } from './platform'

/** Нажатие с флагами модификаторов: KeyboardEvent или его часть. */
type Stroke = Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>

/**
 * Нажатие в записи мака (ADR 0048). Клавиши IDE описаны и проверяются маковскими: ⌘ - главный
 * модификатор. На Windows главный - Ctrl: здесь он становится ⌘, а клавиша Windows - ⌃, и
 * проверки клавиш не знают о платформе. На маке нажатие не меняется.
 */
export const withMacKeys = <T extends Stroke>(event: T): T =>
  IS_MAC ? event : { ...pick(event), metaKey: event.ctrlKey, ctrlKey: event.metaKey }

/**
 * Поля нажатия, которые читают проверки клавиш: у KeyboardEvent они - свойства прототипа и
 * при копировании объекта `{ ...event }` пропали бы.
 */
const pick = <T extends Stroke>(event: T): T =>
  ({
    key: (event as Partial<KeyboardEvent>).key,
    code: (event as Partial<KeyboardEvent>).code,
    repeat: (event as Partial<KeyboardEvent>).repeat,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  }) as unknown as T

/**
 * Сочетание «⌥⌘ + клавиша» на Windows - Alt без Ctrl: Ctrl+Alt там - это AltGr, им на многих
 * раскладках набирают буквы (@, €, польские). Так же, как Alt+C и Alt+W в поиске VS Code.
 */
export const isAltCommand = (event: Stroke): boolean =>
  IS_MAC
    ? event.altKey && event.metaKey && !event.ctrlKey
    : event.altKey && !event.ctrlKey && !event.metaKey

/** Знаки модификаторов мака и их имена на Windows - в порядке Windows: Ctrl, Alt, Shift. */
const WINDOWS_MODIFIERS: readonly (readonly [string, string])[] = [
  ['⌃', 'Ctrl'],
  ['⌘', 'Ctrl'],
  ['⌥', 'Alt'],
  ['⇧', 'Shift'],
]

/** Знаки клавиш мака и их имена на Windows. */
const WINDOWS_KEYS: Readonly<Record<string, string>> = {
  '↵': 'Enter',
  '↩': 'Enter',
  '⌫': 'Backspace',
  '⌦': 'Delete',
  '⎋': 'Esc',
  '⇥': 'Tab',
}

const MAC_MODIFIERS = new Set(['⌃', '⌥', '⇧', '⌘'])

/**
 * Клавиши сочетания плашками (Kbd): на маке - как записаны, на Windows - именами в порядке
 * Windows: ['⇧', '⌘', 'T'] → ['Ctrl', 'Shift', 'T']. ⌥⌘ на Windows - один Alt (isAltCommand).
 */
export const shortcutKeys = (keys: readonly string[]): string[] => {
  if (IS_MAC) return [...keys]

  const modifiers = keys.filter((key) => MAC_MODIFIERS.has(key))
  const rest = keys.filter((key) => !MAC_MODIFIERS.has(key))
  const altCommand = modifiers.includes('⌥') && modifiers.includes('⌘')
  const names = WINDOWS_MODIFIERS.filter(
    ([glyph]) => modifiers.includes(glyph) && !(altCommand && glyph === '⌘'),
  ).map(([, name]) => name)

  return [...new Set(names), ...rest.map((key) => WINDOWS_KEYS[key] ?? key)]
}

/**
 * Сочетание одной строкой для подсказки: на маке «⇧⌘T», на Windows «Ctrl+Shift+T». Строку мака
 * читает так: знаки модификаторов в начале, остальное - клавиша («⌘,», «⌥F12», «⌘Enter»).
 */
export const shortcutLabel = (mac: string): string => {
  if (IS_MAC) return mac

  const chars = [...mac]
  const split = chars.findIndex((char) => !MAC_MODIFIERS.has(char))
  const modifiers = split < 0 ? chars : chars.slice(0, split)
  const key = split < 0 ? '' : chars.slice(split).join('')

  return shortcutKeys(key ? [...modifiers, key] : modifiers).join('+')
}
