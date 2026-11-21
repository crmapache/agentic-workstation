import type { TrackerOp, TrackerRepeated } from '@shared/tracker'
import { TRACKER_LIMITS } from '@shared/tracker'

import { moveCard, createCard, updateCard } from './tracker-card-ops'
import { textOf, titleOf, TrackerError } from './tracker-fields'
import type { OpContext } from './tracker-guards'
import { own, openBranch, slotBefore, openProject, openProjects } from './tracker-guards'
import { rankBefore } from './tracker-rank'
import { numberOf } from './tracker-records'
import { TrackerTree } from './tracker-tree'

/** Что сделала правка: id созданного, id удалённого и сдвиг повторяющейся (для «Undo»). */
export type OpDone = {
  created: string | null
  removed: string[]
  repeated: TrackerRepeated | null
}

const done = (
  created: string | null = null,
  removed: string[] = [],
  repeated: TrackerRepeated | null = null,
): OpDone => ({ created, removed, repeated })

/** Удалить запись с потомками: отметки, а не стирание - для облака и «Undo». */
const remove = (ctx: OpContext, tree: TrackerTree, id: string): string[] => {
  const ids = [id, ...tree.descendants(id)]

  for (const one of ids) ctx.book.write(one, { deleted: true }, true)

  return ids
}

const textFields = (op: { title?: string; subtitle?: string }) => ({
  title: op.title === undefined ? undefined : titleOf(op.title),
  subtitle: op.subtitle === undefined ? undefined : textOf(op.subtitle, TRACKER_LIMITS.subtitle),
})

const projectOps = (ctx: OpContext, tree: TrackerTree, op: TrackerOp): OpDone | null => {
  const { book, spaceId } = ctx

  switch (op.kind) {
    case 'project.create':
      return done(
        book.create('project', {
          space: spaceId,
          title: titleOf(op.title),
          description: textOf(op.description ?? '', TRACKER_LIMITS.description),
          rank: rankBefore(tree.children(spaceId, 'project'), null),
          archivedAt: null,
        }),
      )
    case 'project.update':
      own(ctx, tree, op.id, 'project')
      book.write(op.id, {
        title: op.title === undefined ? undefined : titleOf(op.title),
        description:
          op.description === undefined
            ? undefined
            : textOf(op.description, TRACKER_LIMITS.description),
      })

      return done()
    case 'project.move':
      openProject(ctx, tree, op.id)
      book.write(op.id, {
        rank: slotBefore(
          ctx,
          openProjects(tree, spaceId).filter((one) => one.id !== op.id),
          op.beforeId,
        ),
      })

      return done()
    case 'project.archive':
      openProject(ctx, tree, op.id)
      book.write(op.id, { archivedAt: ctx.now })

      return done()
    case 'project.restore':
    case 'project.purge': {
      const project = own(ctx, tree, op.id, 'project')

      if (numberOf(project, 'archivedAt') === null) throw new TrackerError('notArchived')
      if (op.kind === 'project.restore') {
        book.write(op.id, {
          archivedAt: null,
          rank: rankBefore(openProjects(tree, spaceId), null),
        })

        return done()
      }

      return done(null, remove(ctx, tree, op.id))
    }
    default:
      return null
  }
}

const branchOps = (ctx: OpContext, tree: TrackerTree, op: TrackerOp): OpDone | null => {
  const { book } = ctx

  switch (op.kind) {
    case 'flow.create':
      openProject(ctx, tree, op.projectId)

      return done(
        book.create('flow', {
          project: op.projectId,
          ...textFields({ subtitle: '', ...op }),
          rank: rankBefore(tree.children(op.projectId, 'flow'), null),
        }),
      )
    case 'flow.update':
    case 'group.update':
      openBranch(ctx, tree, op.id, op.kind === 'flow.update' ? 'flow' : 'group')
      book.write(op.id, textFields(op))

      return done()
    case 'flow.move':
      openBranch(ctx, tree, op.id, 'flow')
      openProject(ctx, tree, op.projectId)
      book.write(op.id, {
        project: op.projectId,
        rank: slotBefore(
          ctx,
          tree.children(op.projectId, 'flow').filter((one) => one.id !== op.id),
          op.beforeId,
        ),
      })

      return done()
    case 'group.create':
      openBranch(ctx, tree, op.flowId, 'flow')

      return done(
        book.create('group', {
          flow: op.flowId,
          ...textFields({ subtitle: '', ...op }),
          rank: rankBefore(tree.children(op.flowId, 'group'), null),
        }),
      )
    case 'group.move':
      openBranch(ctx, tree, op.id, 'group')
      openBranch(ctx, tree, op.flowId, 'flow')
      book.write(op.id, {
        flow: op.flowId,
        rank: slotBefore(
          ctx,
          tree.children(op.flowId, 'group').filter((one) => one.id !== op.id),
          op.beforeId,
        ),
      })

      return done()
    case 'flow.delete':
    case 'group.delete':
      openBranch(ctx, tree, op.id, op.kind === 'flow.delete' ? 'flow' : 'group')

      return done(null, remove(ctx, tree, op.id))
    default:
      return null
  }
}

const cardOps = (ctx: OpContext, tree: TrackerTree, op: TrackerOp): OpDone | null => {
  switch (op.kind) {
    case 'card.create':
      return done(createCard(ctx, tree, op))
    case 'card.update':
      return done(null, [], updateCard(ctx, tree, own(ctx, tree, op.id, 'card'), op.fields))
    case 'card.move':
      moveCard(ctx, tree, op)

      return done()
    case 'card.delete':
      own(ctx, tree, op.id, 'card')

      return done(null, remove(ctx, tree, op.id))
    case 'undelete':
      for (const id of op.ids) {
        if (tree.get(id) && tree.spaceOf(id) === ctx.spaceId)
          ctx.book.write(id, { deleted: false }, true)
      }

      return done()
    default:
      return null
  }
}

/**
 * Применить правку к доске пространства. Отказ - TrackerError с кодом; книга при отказе не
 * тронута: проверки идут до первой записи. Окно и модель получают одну перерисовку на правку.
 */
export const applyOp = (ctx: OpContext, op: TrackerOp): OpDone => {
  const tree = new TrackerTree(ctx.book.records())
  const result =
    projectOps(ctx, tree, op) ?? branchOps(ctx, tree, op) ?? cardOps(ctx, tree, op) ?? done()

  ctx.book.commit()

  return result
}
