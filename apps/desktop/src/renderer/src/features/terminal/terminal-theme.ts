import type { ITheme } from '@xterm/xterm'

import { TERMINAL_TYPE_ROLES, TERMINAL_THEME_ROLES } from './terminal.constants'

const readRole = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/**
 * Тема терминала из ролей дизайн-системы, какими они стоят в окне: своих цветов у терминала
 * нет. Фон прозрачный - под ним лист терминала, как у редактора.
 */
export const terminalTheme = (): ITheme => ({
  ...(Object.fromEntries(
    Object.entries(TERMINAL_THEME_ROLES).map(([key, role]) => [key, readRole(role)]),
  ) as ITheme),
  // Прозрачный - восемью цифрами: слово transparent xterm разбирает в чёрный.
  background: '#00000000',
})

/** Шрифт кода из токенов: семейство, кегль в пикселях (растёт с размером текста IDE). */
export const terminalTypography = () => ({
  fontFamily: readRole(TERMINAL_TYPE_ROLES.family),
  fontSize: Number.parseFloat(readRole(TERMINAL_TYPE_ROLES.size)),
  lineHeight: Number.parseFloat(readRole(TERMINAL_TYPE_ROLES.lineHeight)),
})
