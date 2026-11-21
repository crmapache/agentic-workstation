import type { TrackerOp } from '@shared/tracker'

import type { EntityModalProps } from './EntityModal.types'

/** Тексты окна: что было при открытии и что стало. */
type EntityTexts = { opened: { title: string; subtitle: string }; title: string; subtitle: string }

/**
 * Правка, которой окно сохраняет проект, поток или группу. Правка существующего уносит только
 * тронутые поля: нетронутое поле не перебьёт правку другого компьютера, сделанную, пока окно
 * было открыто. null - менять нечего.
 */
export const entityOp = (
  editor: EntityModalProps['editor'],
  { opened, title, subtitle }: EntityTexts,
): TrackerOp | null => {
  const newTitle = title === opened.title ? undefined : title
  const newSubtitle = subtitle === opened.subtitle ? undefined : subtitle
  const untouched = newTitle === undefined && newSubtitle === undefined

  if (editor.kind === 'project') {
    if (!editor.id) return { kind: 'project.create', title, description: subtitle }

    return untouched
      ? null
      : {
          kind: 'project.update',
          id: editor.id,
          ...(newTitle === undefined ? {} : { title: newTitle }),
          ...(newSubtitle === undefined ? {} : { description: newSubtitle }),
        }
  }

  if (!editor.id)
    return editor.kind === 'flow'
      ? { kind: 'flow.create', projectId: editor.projectId, title, subtitle }
      : { kind: 'group.create', flowId: editor.flowId, title, subtitle }

  return untouched
    ? null
    : {
        kind: editor.kind === 'flow' ? 'flow.update' : 'group.update',
        id: editor.id,
        ...(newTitle === undefined ? {} : { title: newTitle }),
        ...(newSubtitle === undefined ? {} : { subtitle: newSubtitle }),
      }
}
