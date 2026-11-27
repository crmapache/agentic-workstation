import type { Rect } from './computer-geometry'
import type { Point } from './computer.types'

/**
 * Окно экрана так, как его видит оконная система: номер, лежит ли оно на уровне обычных окон
 * приложений или ниже (рабочий стол), а не над ними (строка меню, Dock, всплывающие панели, окна
 * «поверх всех»), и где оно в точках экрана.
 */
export type SceneWindow = { id: number; isOrdinary: boolean; bounds: Rect }

/** Окна экрана сверху вниз (ADR 0129): что стоит на экране, помимо картинки снимка. */
export type Scene = readonly SceneWindow[]

/**
 * Окно, как его отдаёт система, до отбора: чьё оно, видно ли его вообще и попадает ли оно на
 * снимок экрана (капсула и стрелка ИИ закрыты от захвата).
 */
export type RawWindow = SceneWindow & { pid: number; isShown: boolean; isCaptured: boolean }

/**
 * Что IDE знает об экране помимо снимка (ADR 0129). Ответ null - система не сказала, и сверять
 * этим нечем: проверка экрана - страховка, она не останавливает работу из-за своего сбоя.
 */
export type ScreenWitness = {
  /** Окна экрана сейчас. */
  scene: () => Scene | null
  /** Сколько мс назад был последний ввод мыши и клавиатуры - чей угодно, и руки ИИ тоже. */
  idleMs: () => number | null
}

/**
 * Окна для сверки: только видимые и не пустые, без своих окон, которых нет на снимке (капсула,
 * стрелка ИИ): стрелка ездит за рукой, и сверка видела бы перемену после каждого шага.
 */
export const sceneOf = (rows: readonly RawWindow[], ownPid: number): Scene =>
  rows
    .filter(
      (row) =>
        row.isShown &&
        row.bounds.width > 0 &&
        row.bounds.height > 0 &&
        !(row.pid === ownPid && !row.isCaptured),
    )
    .map(({ id, isOrdinary, bounds }) => ({ id, isOrdinary, bounds }))

const contains = ({ x, y, width, height }: Rect, point: Point): boolean =>
  point.x >= x && point.y >= y && point.x < x + width && point.y < y + height

/**
 * Окна сверху вниз до первого обычного: в точке (point) - то, во что уйдёт нажатие, и всё, что
 * над ним; без точки - окно, которому идёт клавиатура, и всё, что над ним. Ниже первого обычного
 * окна ни клик, ни клавиатура не попадают, и перемены там не в счёт.
 */
export const stackAt = (scene: Scene, point: Point | null): SceneWindow[] => {
  const stack: SceneWindow[] = []

  for (const window of scene) {
    if (point && !contains(window.bounds, point)) continue

    stack.push(window)

    if (window.isOrdinary) break
  }

  return stack
}

const isSameRect = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/** Те же окна в том же порядке и на тех же местах. */
export const isSameStack = (a: readonly SceneWindow[], b: readonly SceneWindow[]): boolean =>
  a.length === b.length &&
  a.every((window, index) => {
    const other = b[index]

    return other !== undefined && other.id === window.id && isSameRect(other.bounds, window.bounds)
  })
