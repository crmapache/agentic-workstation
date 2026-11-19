import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Modal } from '@agentic-workstation/ui/Modal'
import { Section } from '@agentic-workstation/ui/Section'

import { useExtensionsStore } from '../../extensions.store'
import { useStoreView } from '../../store.queries'
import { storeErrorText } from '../../store.utils'
import { GrantList } from '../../GrantList/GrantList'
import { extensionIcon } from '../../../../lib/extension-icons'
import styles from './ListingModal.module.scss'
import type { ListingModalProps } from './ListingModal.types'
import { dayOf } from './ListingModal.utils'
import { ListingFooter } from './parts/ListingFooter'
import { ListingReadme } from './parts/ListingReadme'
import { RatingSummary } from './parts/RatingSummary'
import { ReviewForm } from './parts/ReviewForm'
import { ReviewList } from './parts/ReviewList'

/**
 * Расширение из магазина окном (ADR 0091): что просит и описание слева, оценки, отзывы и версии
 * справа; поставить, обновить или пожаловаться - в подвале. Права видны до установки: кнопка
 * «поставить и разрешить» и есть согласие человека.
 */
export const ListingModal = ({ listingId }: ListingModalProps) => {
  const { t } = useTranslation()
  const close = useExtensionsStore((store) => store.close)
  const { data } = useStoreView(listingId)
  const view = data?.ok ? data.value : null
  const latest = view?.listing.versions[0]

  return (
    <Modal
      open
      size="lg"
      icon={extensionIcon(view?.listing.icon)}
      iconTone="accent"
      title={view?.listing.name ?? listingId}
      description={
        view
          ? t('extensions.store.listing.subtitle', {
              version: view.listing.version,
              name: view.listing.publisher.name,
            })
          : undefined
      }
      footer={view ? <ListingFooter view={view} /> : undefined}
      closeLabel={t('extensions.store.listing.close')}
      onClose={close}>
      {data && !data.ok && <p className={styles.failure}>{storeErrorText(t, data)}</p>}
      {view && (
        <div className={styles.layout}>
          <div className={styles.columns}>
            <div className={styles.column}>
              {view.mine && <p className={styles.note}>{t('extensions.store.listing.mine')}</p>}
              <Section
                size="sm"
                title={t('extensions.store.listing.permissions')}
                description={
                  latest?.permissions.length
                    ? undefined
                    : t('extensions.store.listing.noPermissions')
                }>
                {latest && latest.permissions.length > 0 && <GrantList grant={latest} />}
              </Section>
              <Section size="sm" title={t('extensions.store.listing.readme')}>
                <ListingReadme view={view} />
              </Section>
            </div>
            <div className={clsx(styles.column, styles.side)}>
              <Section
                size="sm"
                title={t('extensions.store.listing.reviews')}
                count={view.listing.rating.count || undefined}>
                <div className={styles.stack}>
                  <RatingSummary view={view} />
                  <ReviewForm view={view} />
                  <ReviewList listingId={listingId} first={view.reviews} />
                </div>
              </Section>
              <Section size="sm" title={t('extensions.store.listing.versions')}>
                <ul className={styles.versions}>
                  {view.listing.versions.map((version) => (
                    <li key={version.version} className={styles.version}>
                      <span>{t('extensions.store.version', { version: version.version })}</span>
                      <span>{dayOf(version.publishedAt)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
