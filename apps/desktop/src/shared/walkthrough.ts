import type { ConnectorAvailability } from './connector-availability'
import { isAvailableIn } from './connector-availability'
import type { ConnectorKind } from './connectors'

/**
 * Walkthrough (ADR 0134): голосовой показ на экране. Модель говорит звонком (ADR 0104), смотрит и
 * действует Computer Use (ADR 0057), а куда смотреть - обводит маркером в прозрачном окне поверх
 * экрана. Общие типы окна IDE, окна меток и главного процесса.
 */

/** Имя сервера Walkthrough: тип в начале - правило коннекторов (ADR 0028). */
export const WALKTHROUGH_SERVER_NAME = 'walkthrough'

/** Без чего показа нет: смотрит и действует Computer Use, страницу читает Browser. */
export const WALKTHROUGH_NEEDS = ['computer', 'browser'] as const satisfies readonly ConnectorKind[]

export type WalkthroughNeed = (typeof WALKTHROUGH_NEEDS)[number]

/** Коннектор так, как его видит проверка готовности: и реестр главного процесса, и окно. */
type ConnectorLike = { kind: ConnectorKind; enabled: boolean; availability: ConnectorAvailability }

/**
 * Чего не хватает показу: Computer Use и Browser должны быть добавлены и включены, а в проекте
 * (projectPath) - ещё и видны в нём. Проекта нет - только добавлены и включены (каталог). Пусто -
 * готов.
 */
export const walkthroughMissing = (
  connectors: readonly ConnectorLike[],
  projectPath: string | null,
): WalkthroughNeed[] =>
  WALKTHROUGH_NEEDS.filter(
    (need) =>
      !connectors.some(
        (connector) =>
          connector.kind === need &&
          connector.enabled &&
          (projectPath === null || isAvailableIn(connector.availability, projectPath)),
      ),
  )

/**
 * Готов ли показ в проекте: сам Walkthrough добавлен, включён и виден в нём, и всё, без чего
 * его нет, - тоже. Так решают и шлюз (отдать ли сервер процессу), и кнопка в шапке панели.
 */
export const isWalkthroughReady = (
  connectors: readonly ConnectorLike[],
  projectPath: string,
): boolean =>
  connectors.some(
    (connector) =>
      connector.kind === 'walkthrough' &&
      connector.enabled &&
      isAvailableIn(connector.availability, projectPath),
  ) && walkthroughMissing(connectors, projectPath).length === 0

/** Точка окна меток в его точках (DIP), от левого верхнего угла окна. */
export type MarkPoint = { x: number; y: number }

export type MarkBox = { x: number; y: number; width: number; height: number }

/**
 * Метка на экране: обводка маркером (главное), стрелка к точке, затемнение всего, кроме области.
 * id растёт с каждой меткой: по нему окно заново проигрывает появление и выбирает форму обводки.
 */
export type WalkthroughMark =
  | { kind: 'circle'; id: number; box: MarkBox }
  | { kind: 'arrow'; id: number; from: MarkPoint; to: MarkPoint }
  | { kind: 'spotlight'; id: number; box: MarkBox }

/** Что рисует окно меток сейчас: размер окна в точках и метки по порядку (затемнение - снизу). */
export type WalkthroughMarksView = { width: number; height: number; marks: WalkthroughMark[] }
