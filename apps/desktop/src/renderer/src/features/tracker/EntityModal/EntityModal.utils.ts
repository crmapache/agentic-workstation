import type { TrackerOp } from '@shared/tracker'

import type { EntityModalProps } from './EntityModal.types'

/** Правка, которой окно сохраняет проект, поток или группу. */
export const entityOp = (
  editor: EntityModalProps['editor'],
  title: string,
  subtitle: string,
): TrackerOp => {
  if (editor.kind === 'project')
    return editor.id
      ? { kind: 'project.update', id: editor.id, title, description: subtitle }
      : { kind: 'project.create', title, description: subtitle }

  if (editor.kind === 'flow')
    return editor.id
      ? { kind: 'flow.update', id: editor.id, title, subtitle }
      : { kind: 'flow.create', projectId: editor.projectId, title, subtitle }

  return editor.id
    ? { kind: 'group.update', id: editor.id, title, subtitle }
    : { kind: 'group.create', flowId: editor.flowId, title, subtitle }
}
