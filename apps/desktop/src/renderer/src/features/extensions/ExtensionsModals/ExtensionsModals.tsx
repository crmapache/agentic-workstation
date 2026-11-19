import type { ExtensionsState } from '@shared/extensions'

import { useExtensionsStore } from '../extensions.store'
import { AiExtensionModal } from '../AiExtensionModal/AiExtensionModal'
import { ExtensionModal } from '../ExtensionModal/ExtensionModal'
import { PublishModal } from '../PublishModal/PublishModal'
import { ListingModal } from '../StorePage/ListingModal/ListingModal'

/** Окно поверх вида Extensions: одно за раз, какое - решает стор вида. */
export const ExtensionsModals = ({ state }: { state: ExtensionsState }) => {
  const panel = useExtensionsStore((store) => store.panel)

  if (!panel) return null
  if (panel.kind === 'new') return <AiExtensionModal key="new" extension={null} />
  if (panel.kind === 'listing')
    return <ListingModal key={panel.id} listingId={panel.id} installed={state} />

  const extension = state.extensions.find((item) => item.id === panel.id)

  if (!extension) return null
  if (panel.kind === 'edit')
    return <AiExtensionModal key={`edit:${extension.id}`} extension={extension} />
  if (panel.kind === 'publish') return <PublishModal extension={extension} />

  return <ExtensionModal extension={extension} />
}
