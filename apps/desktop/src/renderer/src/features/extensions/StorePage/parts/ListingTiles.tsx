import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Tile } from '@agentic-workstation/ui/Tile'

import styles from '../StorePage.module.scss'
import type { ListingTilesProps } from '../StorePage.types'
import { useExtensionsStore } from '../../extensions.store'
import { listingMeta } from '../../store.utils'
import { extensionIcon } from '../../../../lib/extension-icons'

/** Расширения магазина плитками: имя, описание, оценка, установки, автор; стоит ли уже здесь. */
export const ListingTiles = ({ listings, installed, updates }: ListingTilesProps) => {
  const { t } = useTranslation()
  const open = useExtensionsStore((store) => store.open)

  return (
    <div className={styles.grid}>
      {listings.map((listing) => {
        const here = installed.extensions.some((item) => item.id === listing.id)
        const update = updates.some((item) => item.id === listing.id)

        return (
          <Tile
            key={listing.id}
            icon={extensionIcon(listing.icon)}
            iconTone="accent"
            title={listing.name}
            description={listing.description}
            meta={listingMeta(t, listing)}
            status={
              update ? (
                <Badge tone="accent">{t('extensions.store.updateBadge')}</Badge>
              ) : here ? (
                <Badge tone="success">{t('extensions.store.installed')}</Badge>
              ) : undefined
            }
            onClick={() => open({ kind: 'listing', id: listing.id })}
          />
        )
      })}
    </div>
  )
}
