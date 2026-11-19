import { join } from 'node:path'

import { app, dialog } from 'electron'
import type { BrowserWindow } from 'electron'

import type { CommandHint, AttachmentPath } from '@shared/message-draft'

import { claudeHome } from '../history/transcript-paths'
import { describePaths } from './attachment-paths'
import { scanShelves } from './command-scan'
import { commandShelves } from './command-shelves'
import { PASTED_DIR_NAME, PASTED_MAX_BYTES } from './composer.constants'
import { pastedName, sweepPasted, writePasted } from './pasted-files'

/**
 * Всё, что полю ввода нужно от машины, но не от разговора: найти команды на диске,
 * выбрать и описать вложения, записать вставленное из буфера.
 */
export class ComposerTools {
  async commands(projectPath: string): Promise<CommandHint[]> {
    return scanShelves(await commandShelves(projectPath, await claudeHome()))
  }

  describe(projectPath: string, paths: readonly string[]): Promise<AttachmentPath[]> {
    return describePaths(projectPath, paths)
  }

  /** Системный выбор: файлы, картинки и папки разом, от папки проекта. */
  async pick(window: BrowserWindow | null, projectPath: string): Promise<AttachmentPath[]> {
    const options = {
      defaultPath: projectPath,
      properties: ['openFile', 'openDirectory', 'multiSelections'] as Array<
        'openFile' | 'openDirectory' | 'multiSelections'
      >,
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    return result.canceled ? [] : this.describe(projectPath, result.filePaths)
  }

  /** Байты из буфера - файлом в каталоге IDE; заодно метётся старое. */
  async savePasted(name: string, base64: string): Promise<string | null> {
    const bytes = Buffer.from(base64, 'base64')

    if (bytes.length === 0 || bytes.length > PASTED_MAX_BYTES) return null

    const dir = join(app.getPath('userData'), PASTED_DIR_NAME)

    await sweepPasted(dir, Date.now())

    return writePasted(dir, pastedName(name, new Date()), bytes).catch((error: unknown) => {
      console.warn('[claude] вставленный файл не записался:', error)

      return null
    })
  }
}
