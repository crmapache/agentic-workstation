import type { ConnectorAvailability } from './connector-availability'
import { isAvailableIn } from './connector-availability'
import type { ConnectorKind } from './connectors'

/**
 * Walkthrough (ADR 0134, 0135): голосовой показ на экране. Модель говорит звонком (ADR 0104),
 * смотрит и действует Computer Use (ADR 0057), а куда смотреть - подсвечивает, затемняя всё
 * остальное в прозрачном окне поверх экрана; человек отвечает голосом и своими пометками. Общие
 * типы окна IDE, окна меток, панели инструментов и главного процесса.
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
 * Инструменты человека в показе (ADR 0135): обвести от руки, подчеркнуть, показать стрелкой. Он
 * берёт их на панели сбоку экрана, рисует поверх и говорит, о чём это, - модель видит пометки
 * инструментом user_marks.
 */
export const WALKTHROUGH_PENS = ['outline', 'underline', 'arrow'] as const

export type WalkthroughPen = (typeof WALKTHROUGH_PENS)[number]

export const isWalkthroughPen = (value: unknown): value is WalkthroughPen =>
  typeof value === 'string' && (WALKTHROUGH_PENS as readonly string[]).includes(value)

/**
 * Подсветка модели (ADR 0135): вырез в затемнении экрана. slot - место выреза по порядку: новая
 * подсветка вместо прежней встаёт в тот же слот, и вырез переезжает к ней плавно, а не мигает.
 */
export type WalkthroughLit = { slot: number; box: MarkBox }

/**
 * Пометка человека: у обводки - путь руки, у подчёркивания и стрелки - начало и конец (у стрелки
 * конец - острие). id растёт с каждой пометкой.
 */
export type WalkthroughStroke = { id: number; pen: WalkthroughPen; points: MarkPoint[] }

/**
 * Что рисует окно меток сейчас, в точках окна: подсветки модели, пометки человека и инструмент у
 * него в руке - тогда окно ловит мышь и рисует им, иначе мышь проходит насквозь.
 */
export type WalkthroughMarksView = {
  width: number
  height: number
  lit: WalkthroughLit[]
  strokes: WalkthroughStroke[]
  pen: WalkthroughPen | null
}

/** Панель инструментов человека: что у него в руке и есть ли что стереть. */
export type WalkthroughPanelView = { pen: WalkthroughPen | null; hasStrokes: boolean }

/** Сколько точек одной пометки окно меток шлёт главному процессу, не больше. */
export const STROKE_POINTS_MAX = 2000
