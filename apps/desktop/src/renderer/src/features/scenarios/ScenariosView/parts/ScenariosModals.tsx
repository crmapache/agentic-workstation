import type { ScenariosTabProps } from '../ScenariosView.types'
import { useScenariosStore } from '../../scenarios.store'
import { AuthorModal } from '../../AuthorModal/AuthorModal'
import { EditorModal } from '../../EditorModal/EditorModal'
import { LaunchModal } from '../../LaunchModal/LaunchModal'
import { RunModal } from '../../RunModal/RunModal'
import { ScheduleModal } from '../../ScheduleModal/ScheduleModal'
import { WorktreeRemoveDialog } from '../../WorktreeRemoveDialog/WorktreeRemoveDialog'

/** Открытое окно вида сценариев - одно за раз (ADR 0030). */
export const ScenariosModals = ({ project }: ScenariosTabProps) => {
  const modal = useScenariosStore((state) => state.modal)

  switch (modal?.kind) {
    case 'launch':
      return <LaunchModal project={project} request={modal} />
    case 'run':
      return <RunModal project={project} request={modal} />
    case 'editor':
      return <EditorModal project={project} request={modal} />
    case 'author':
      return <AuthorModal project={project} />
    case 'schedule':
      return <ScheduleModal project={project} request={modal} />
    case 'worktreeRemove':
      return <WorktreeRemoveDialog request={modal} />
    case undefined:
      return null
  }
}
