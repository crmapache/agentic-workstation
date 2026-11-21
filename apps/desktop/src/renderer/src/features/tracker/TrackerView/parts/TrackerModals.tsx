import type { TrackerModalsProps } from '../TrackerView.types'
import { findCard, sendingOf, entityTexts } from '../TrackerView.utils'
import { useTrackerStore } from '../../tracker.store'
import { ArchiveModal } from '../../ArchiveModal/ArchiveModal'
import { CardModal } from '../../CardModal/CardModal'
import { CloudModal } from '../../CloudModal/CloudModal'
import { EntityModal } from '../../EntityModal/EntityModal'
import { SendModal } from '../../SendModal/SendModal'

/** Окна трекера по центру: карточка, проект/поток/группа, отправка в очередь, архив, облако. */
export const TrackerModals = ({ board, onCreatedProject }: TrackerModalsProps) => {
  const editor = useTrackerStore((state) => state.editor)
  const sending = useTrackerStore((state) => state.sending)
  const dialog = useTrackerStore((state) => state.dialog)
  const card = editor?.kind === 'card' ? findCard(board, editor.cardId) : null
  const send = sending && sendingOf(board, sending)

  return (
    <>
      {card && <CardModal key={card.id} mode="edit" card={card} />}
      {editor?.kind === 'newCard' && (
        <CardModal mode="new" groupId={editor.groupId} followUpOf={editor.followUpOf} />
      )}
      {(editor?.kind === 'project' || editor?.kind === 'flow' || editor?.kind === 'group') && (
        <EntityModal
          key={`${editor.kind}:${editor.id ?? 'new'}`}
          editor={editor}
          {...entityTexts(board, editor)}
          onCreated={onCreatedProject}
        />
      )}
      {sending && send && <SendModal sending={sending} cards={send.cards} title={send.title} />}
      {dialog === 'archive' && <ArchiveModal archived={board.archived} />}
      {dialog === 'cloud' && <CloudModal />}
    </>
  )
}
