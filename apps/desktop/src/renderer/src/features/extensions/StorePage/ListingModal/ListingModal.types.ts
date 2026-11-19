import type { StoreReview, StoreListingView } from '@shared/extension-store'
import type { ExtensionsState } from '@shared/extensions'

export type ListingModalProps = { listingId: string; installed: ExtensionsState }

export type ListingPartProps = { view: StoreListingView }

export type ReviewListProps = { listingId: string; first: StoreListingView['reviews'] }

export type ReviewItemProps = { review: StoreReview }

export type StarsProps = {
  value: number
  onPick?: ((value: number) => void) | undefined
}
