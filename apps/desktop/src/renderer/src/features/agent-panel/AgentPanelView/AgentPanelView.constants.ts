/** Клавиши, которые сами по себе - не действие: ⌘Tab начинается с ⌘. */
export const LONE_MODIFIERS: ReadonlySet<string> = new Set([
  'Meta',
  'Shift',
  'Alt',
  'Control',
  'CapsLock',
])
