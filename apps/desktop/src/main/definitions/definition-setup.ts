import { DefinitionLink } from './definition-link'
import { DefinitionService } from './definition-service'
import definitionWorkerPath from './definition-worker?modulePath'
import { DEFINITION_IDLE_MS } from './definition.constants'

/**
 * Сервис определений со своим процессом. electron-vite собирает definition-worker.ts отдельным
 * файлом рядом с бандлом главного процесса (импорт ?modulePath) - вместе с компилятором
 * TypeScript, которого в самом главном процессе нет. Тесты этот файл не импортируют.
 */
export const createDefinitionService = (): DefinitionService =>
  new DefinitionService(new DefinitionLink(definitionWorkerPath, DEFINITION_IDLE_MS))
