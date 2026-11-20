import { join } from 'node:path'

import type { MemorySaverPrefs, MemorySaverState } from '@shared/memory-saver'

import { MemorySaverService } from '../memory-saver/memory-saver-service'
import { JsonFile } from '../storage/json-file'
import { DefinitionLink } from './definition-link'
import { DefinitionService } from './definition-service'
import definitionWorkerPath from './definition-worker?modulePath'
import { DEFINITION_IDLE_MS } from './definition.constants'

/**
 * Процесс редактора заблокирован до чтения настройки. Компилятор TypeScript собирается
 * отдельно (?modulePath) и не загружается ни в главный процесс, ни при запуске IDE.
 */
export const createEditorServices = async (
  dataDir: string,
  onChange: (state: MemorySaverState) => void,
) => {
  const link = new DefinitionLink(definitionWorkerPath, DEFINITION_IDLE_MS)
  const memorySaver = await MemorySaverService.load(
    new JsonFile<MemorySaverPrefs>(join(dataDir, 'memory-saver.json')),
    link,
    onChange,
  )

  return { definitions: new DefinitionService(link), memorySaver }
}
