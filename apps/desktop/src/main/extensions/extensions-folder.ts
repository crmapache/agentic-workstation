import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Папка расширений (ADR 0091), рядом с домом IDE (ADR 0059): у копии с отдельным профилем -
 * внутри профиля, иначе - общая для установленной IDE и dev в домашней папке пользователя.
 */
export const extensionsFolderPath = (profileDir: string | undefined): string =>
  profileDir
    ? join(profileDir, 'extensions')
    : join(homedir(), '.agentic-workstation', 'extensions')
