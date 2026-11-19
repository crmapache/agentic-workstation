import { useState, useDeferredValue } from 'react'
import { Store, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { StoreSort } from '@shared/extension-store'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Section } from '@agentic-workstation/ui/Section'
import { Tabs } from '@agentic-workstation/ui/Tabs'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useStoreList, useStoreUpdates } from '../store.queries'
import { storeErrorText } from '../store.utils'
import styles from './StorePage.module.scss'
import type { StorePageProps } from './StorePage.types'
import { ListingTiles } from './parts/ListingTiles'
import { UpdatesSection } from './parts/UpdatesSection'

/**
 * Магазин расширений (ADR 0091): поиск и порядок, обновления поставленного, каталог плитками.
 * Карточка расширения с правами, описанием и отзывами - окном по нажатию плитки.
 */
export const StorePage = ({ installed }: StorePageProps) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<StoreSort>('popular')
  const q = useDeferredValue(query.trim())
  const list = useStoreList(q, sort)
  const { data: updates } = useStoreUpdates()
  const pages = list.data?.pages ?? []
  const failure = pages.find((page) => !page.ok)
  const listings = pages.flatMap((page) => (page.ok ? page.value.items : []))

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <TextField
            icon={Search}
            label={t('extensions.store.search')}
            hideLabel
            placeholder={t('extensions.store.search')}
            value={query}
            onChange={setQuery}
          />
        </div>
        <Tabs
          label={t('extensions.store.sortLabel')}
          value={sort}
          items={(['popular', 'rating', 'new'] as const).map((id) => ({
            id,
            label: t(`extensions.store.sort.${id}`),
          }))}
          onChange={setSort}
        />
      </div>
      {updates?.ok && <UpdatesSection updates={updates.value} installed={installed} />}
      {failure && !failure.ok ? (
        <p className={styles.failure}>{storeErrorText(t, failure)}</p>
      ) : listings.length === 0 && !list.isPending ? (
        <EmptyState
          icon={Store}
          title={q ? t('extensions.store.nothing') : t('extensions.store.empty')}
          description={q ? t('extensions.store.nothingHint') : t('extensions.store.emptyHint')}
        />
      ) : (
        <Section
          title={t('extensions.store.results')}
          count={pages[0]?.ok ? pages[0].value.total : undefined}>
          <ListingTiles
            listings={listings}
            installed={installed}
            updates={updates?.ok ? updates.value : []}
          />
          {list.hasNextPage && (
            <div className={styles.more}>
              <Button
                variant="ghost"
                size="sm"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}>
                {t('extensions.store.more')}
              </Button>
            </div>
          )}
        </Section>
      )}
    </>
  )
}
