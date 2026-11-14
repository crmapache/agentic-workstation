import { IS_WINDOWS } from '../platform'
import {
  WINDOWS_KEY_CODES,
  WINDOWS_MODIFIERS,
  WINDOWS_MODIFIER_ALIASES,
} from './computer-keys-windows.constants'
import {
  KEY_ALIASES,
  MAC_TAB_KEY,
  MAC_KEY_CODES,
  MAC_MODIFIERS,
  MAC_RETURN_KEY,
  MAC_MODIFIER_ALIASES,
} from './computer-keys.constants'
import type { Keymap, Modifier } from './computer.types'

export const MAC_KEYMAP: Keymap = {
  codes: MAC_KEY_CODES,
  modifiers: MAC_MODIFIERS,
  modifierAliases: MAC_MODIFIER_ALIASES,
  returnKey: MAC_RETURN_KEY,
  tabKey: MAC_TAB_KEY,
}

export const WINDOWS_KEYMAP: Keymap = {
  codes: WINDOWS_KEY_CODES,
  modifiers: WINDOWS_MODIFIERS,
  modifierAliases: WINDOWS_MODIFIER_ALIASES,
  returnKey: WINDOWS_KEY_CODES['return'] ?? 0x0d,
  tabKey: WINDOWS_KEY_CODES['tab'] ?? 0x09,
}

/** Клавиатура системы, на которой идёт IDE (ADR 0048). */
export const PLATFORM_KEYMAP: Keymap = IS_WINDOWS ? WINDOWS_KEYMAP : MAC_KEYMAP

/** Сочетание, разобранное в коды: модификаторы по порядку и сама клавиша (её может не быть). */
export type KeyChord = {
  modifiers: Modifier[]
  key: number | null
}

/** Сочетание не разобрать: модель увидит текст и исправит вызов. */
export class KeyNameError extends Error {}

const normalize = (name: string) => name.trim().toLowerCase().replace(/[_-]/g, '')

const keyCodeOf = (name: string, codes: Keymap['codes']): number | undefined => {
  // Знак «-» и «_» нормализация съела бы - их ищем как есть.
  const raw = name.trim().toLowerCase()
  const exact = codes[raw]

  if (exact !== undefined) return exact

  const short = normalize(name)

  return codes[KEY_ALIASES[short] ?? short]
}

/**
 * «cmd+shift+t», «Return», «ctrl+Page_Down», «+» отдельно - в коды системы (keymap). Модификатор
 * без клавиши («shift») - тоже сочетание: его просто нажмут и отпустят. Неизвестное имя -
 * KeyNameError.
 */
export const parseChord = (chord: string, keymap: Keymap = PLATFORM_KEYMAP): KeyChord => {
  const text = chord.trim()

  if (!text) throw new KeyNameError('Empty key combination.')

  // «+» как клавиша: «cmd++» или просто «+».
  const parts = text === '+' ? ['+'] : text.replace(/\+\+$/, '+plus').split('+')
  const modifiers: KeyChord['modifiers'] = []
  let key: number | null = null

  for (const part of parts) {
    const short = normalize(part)
    const modifier = keymap.modifiers[keymap.modifierAliases[short] ?? short]

    if (modifier) {
      if (!modifiers.includes(modifier)) modifiers.push(modifier)
      continue
    }

    const code = part === '+' ? keymap.codes['='] : keyCodeOf(part, keymap.codes)

    if (code === undefined) throw new KeyNameError(`Unknown key "${part.trim()}" in "${chord}".`)
    if (key !== null) throw new KeyNameError(`Two keys in "${chord}": press them one by one.`)

    key = code
  }

  return { modifiers, key }
}
