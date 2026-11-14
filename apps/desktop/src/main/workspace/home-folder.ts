import { homedir } from 'node:os'
import { join } from 'node:path'

import { HOME_FOLDER_PARTS, PROFILE_HOME_FOLDER } from './workspace.constants'

/**
 * Папка домашнего проекта (ADR 0059). У копии с отдельным профилем (окно агента, update-e2e) -
 * внутри профиля, иначе - общая для установленной IDE и dev в домашней папке пользователя.
 */
export const homeFolderPath = (profileDir: string | undefined): string =>
  profileDir ? join(profileDir, PROFILE_HOME_FOLDER) : join(homedir(), ...HOME_FOLDER_PARTS)
