import type { TrackerBook } from './tracker-book'
import { TrackerError } from './tracker-fields'
import type { RecordKind, TrackerRecord } from './tracker-records'
import { numberOf } from './tracker-records'
import type { TrackerTree } from './tracker-tree'

/**
 * Проверки правки доски: запись живая, своя (того же пространства) и не в архиве. Идут до первой
 * записи в книгу: отказ не оставляет полуправки.
 */

/** Где идёт правка: книга, пространство доски (проект IDE) и время правки. */
export type OpContext = { book: TrackerBook; spaceId: string; now: number }

/** Живая запись своей доски или отказ: чужая доска - wrongBoard, нет такой - notFound. */
export const own = (
  ctx: OpContext,
  tree: TrackerTree,
  id: string,
  kind: RecordKind,
): TrackerRecord => {
  const record = tree.alive(id, kind)

  if (!record) throw new TrackerError('notFound')
  if (tree.spaceOf(id) !== ctx.spaceId) throw new TrackerError('wrongBoard')

  return record
}

/** Проект, куда можно класть: в архиве - отказ. */
export const openProject = (ctx: OpContext, tree: TrackerTree, id: string) => {
  const project = own(ctx, tree, id, 'project')

  if (numberOf(project, 'archivedAt') !== null) throw new TrackerError('archived')

  return project
}

/** Ветка, в которой лежит запись, не в архиве: поток и группу архивного проекта не правят. */
export const openBranch = (ctx: OpContext, tree: TrackerTree, id: string, kind: RecordKind) => {
  const record = own(ctx, tree, id, kind)
  const project = tree.ancestor(id, 'project')

  if (project && numberOf(project, 'archivedAt') !== null) throw new TrackerError('archived')

  return record
}

/** Живые проекты доски не из архива, по месту. */
export const openProjects = (tree: TrackerTree, spaceId: string) =>
  tree.children(spaceId, 'project').filter((one) => numberOf(one.record, 'archivedAt') === null)
