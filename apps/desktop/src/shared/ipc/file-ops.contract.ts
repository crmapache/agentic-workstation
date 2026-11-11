import type {
  FileMove,
  EntryKind,
  FileOpOutcome,
  ReferencePlan,
  FileMoveOutcome,
} from '../file-ops'

type ProjectRequest = { projectId: string }

/**
 * Часть контракта (contract.ts) про действия с файлами проекта из дерева. Отдельным файлом по
 * области; в InvokeContract и INVOKE_CHANNELS входит целиком (.claude/rules/ipc-contract.md).
 * Дерево перечитает папки само - по событию диска fs:changed.
 */
export type FileOpsInvokeContract = {
  /** Новый файл или папка в папке parent; имя может нести подпапки («ui/Button.tsx»). */
  'files:create': {
    request: ProjectRequest & { parent: string; name: string; kind: EntryKind }
    response: FileOpOutcome
  }
  /** Сколько и где ссылок на то, что переносят, - до переноса: окно спрашивает человека. */
  'files:references': { request: ProjectRequest & { move: FileMove }; response: ReferencePlan }
  /** Перенос или переименование; с updateReferences - и правка ссылок в файлах проекта. */
  'files:move': {
    request: ProjectRequest & { move: FileMove; updateReferences: boolean }
    response: FileMoveOutcome
  }
  /** Копия в папку toDirectory; занятое имя - «имя copy», «имя copy 2», как в Finder. */
  'files:copy': {
    request: ProjectRequest & { from: string; toDirectory: string }
    response: FileOpOutcome
  }
  /** В корзину системы, а не насовсем: ошибку можно вернуть из Finder. */
  'files:trash': { request: ProjectRequest & { path: string }; response: FileOpOutcome }
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const FILE_OPS_CHANNELS = {
  'files:create': true,
  'files:references': true,
  'files:move': true,
  'files:copy': true,
  'files:trash': true,
} satisfies Record<keyof FileOpsInvokeContract, true>
