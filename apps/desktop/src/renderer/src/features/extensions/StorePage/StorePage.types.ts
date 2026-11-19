import type { StoreUpdate, StoreListing } from '@shared/extension-store'
import type { ExtensionsState } from '@shared/extensions'

export type StorePageProps = { installed: ExtensionsState }

export type ListingTilesProps = {
  listings: readonly StoreListing[]
  installed: ExtensionsState
  updates: readonly StoreUpdate[]
}

export type UpdatesSectionProps = { updates: readonly StoreUpdate[]; installed: ExtensionsState }
